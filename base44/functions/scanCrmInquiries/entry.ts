import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet } from '../../shared/emailDb.ts';

// Automatischer CRM-Workflow: prüft neue eingehende E-Mail-Threads auf Angebotsanfragen.
// Sichere Treffer -> CrmDeal wird automatisch angelegt + Stammdaten-/Kontakt-Recherche gestartet.
// Unsichere Treffer -> landen im CRM-Posteingang zur manuellen Prüfung.
// Geprüfte Nicht-Anfragen werden als 'dismissed' Ledger-Eintrag vermerkt (kein Doppel-Check).

const INTERNAL_DOMAINS = ['rittler.co', 'rico-office.at'];
const SYSTEM_DOMAINS = ['awork.com', 'brevo.com', 'm.brevo.com', 'sevdesk.de', 'sevdesk.com', 'wordpress.com',
  'google.com', 'microsoft.com', 'linkedin.com', 'mailchimp.com', 'atlassian.com', 'base44.com',
  'paypal.com', 'stripe.com', 'amazonses.com', 'facebookmail.com', 'instagram.com'];

async function markChecked(db, thread, reason) {
  await db.CrmInboxItem.create({
    source: 'email',
    email_message_id: `thread:${thread.id}`,
    subject: (thread.subject || '').slice(0, 200),
    body: `Automatisch geprüft — keine Angebotsanfrage (${reason}).`,
    status: 'dismissed',
    suggested_pipeline: 'unknown',
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole.entities;

    const payload = await req.json().catch(() => ({}));
    const days = payload.days || 3;
    const maxLlm = payload.max_llm || 10;

    // 1. Ledger: bereits geprüfte Threads überspringen
    const existing = await db.CrmInboxItem.filter({ source: 'email' }, '-created_date', 500);
    const seen = new Set(existing.map((i) => i.email_message_id).filter(Boolean));

    // 2. Aktuelle Threads aus der zentralen E-Mail-DB
    const listing = await emailDbGet('threads', { days, limit: 100 });
    const threads = (listing.results || []).filter((t) => !seen.has(`thread:${t.id}`));

    // 3. Bestandskunden für die Neukunde/Bestandskunde-Einordnung
    const projects = await db.LiquidityProject.list('-updated_date', 500);
    const customers = [...new Set(projects.map((p) => p.customer).filter(Boolean))];

    let llmCalls = 0;
    const stats = { threads_new: threads.length, checked: 0, inquiries: 0, deals_created: 0, needs_review: 0, errors: [] };

    for (const t of threads) {
      if (llmCalls >= maxLlm) break;
      try {
        const detail = await emailDbGet('thread', { id: t.id, msgs: 5, full: 1 });
        const msgs = detail.messages || [];
        const formRegex = /hurra[\s\S]{0,15}die post ist da|sch(ö|oe)n von ihnen zu lesen|kontaktformular/i;
        // Erste eingehende Nachricht (Nachrichten sind neueste zuerst).
        let firstIn = [...msgs].reverse().find((m) => m.direction === 'in');
        // Website-Formular-Mails laufen von office@ an office@ und sind daher als 'intern' markiert
        if (!firstIn) {
          const oldest = msgs[msgs.length - 1];
          if (oldest && formRegex.test(`${t.subject || ''} ${oldest.text || ''}`)) firstIn = oldest;
        }
        if (!firstIn) { await markChecked(db, t, 'keine eingehende Nachricht'); stats.checked++; continue; }

        const from = String(firstIn.from || '').toLowerCase();
        const domain = (from.match(/@([a-z0-9.\-]+)/) || [])[1] || '';
        // Website-Formular-Mails kommen von der EIGENEN Domain (z.B. office@rittler.co) — die dürfen nicht aussortiert werden
        const looksLikeFormMail = formRegex.test(`${t.subject || ''} ${firstIn.text || ''}`);
        if (!looksLikeFormMail && INTERNAL_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) {
          await markChecked(db, t, 'interner Absender'); stats.checked++; continue;
        }
        if (SYSTEM_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) {
          await markChecked(db, t, 'System-/Tool-Absender'); stats.checked++; continue;
        }

        llmCalls++;
        const bodyText = (firstIn.text || '').slice(0, 5000);
        const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Du prüfst für die Digitalagentur Rittler & Co (rittler.co / rico-office.at), ob eine eingehende E-Mail eine ANGEBOTSANFRAGE ist — also eine neue Projekt- oder Leistungsanfrage, aus der ein CRM-Lead entstehen soll.

TYPISCHE ANGEBOTSANFRAGEN:
- E-Mails vom eigenen Website-Kontaktformular. Erkennungsmerkmale: Formulierungen wie "Hurra, die Post ist da", "Schön von Ihnen zu lesen" oder klar strukturierte Formularfelder (Name, E-Mail, Telefon, Nachricht).
- Direkte Anfragen an die Office-Adresse: Kunde/Interessent bittet um Angebot, Kostenschätzung, neues Projekt (Website, Design, Marketing, Programmierung).
- Auch Bestandskunden, die ein NEUES Projekt oder eine Erweiterung anfragen, zählen.

WICHTIG: E-Mails vom Website-Kontaktformular gelten IMMER als Angebotsanfrage (is_inquiry=true) — auch wenn die Absenderadresse die eigene Domain (office@rittler.co) ist, denn das Formular versendet über diese Adresse. Verwirf Formular-Einsendungen NICHT als "internen Test" — stufe sie im Zweifel als Anfrage mit confidence="mittel" ein. Einzige Ausnahme: offensichtlicher Spam.

KEINE ANGEBOTSANFRAGEN (is_inquiry=false):
- Laufende Projektkommunikation, Rückfragen, Abnahmen, Terminabstimmungen
- Rechnungen, Zahlungserinnerungen, Buchhaltung
- Newsletter, Werbung, Spam, Bewerbungen
- System-/Tool-Benachrichtigungen

E-MAIL:
Absender: ${firstIn.from_name || ''} <${firstIn.from || ''}>
Empfänger: ${firstIn.to || '—'}
Betreff: ${t.subject || '—'}
Inhalt:
"""
${bodyText}
"""

BESTANDSKUNDEN (exakte Zuordnung nur bei klarer Übereinstimmung von Firma/Domain, NICHT bei bloßer Themenähnlichkeit):
${customers.slice(0, 200).join(', ')}

Extrahiere bei einer Anfrage die Kontaktdaten AUS DEM TEXT (nichts erfinden). confidence="hoch" NUR wenn eindeutig eine Angebotsanfrage vorliegt UND eine Kontakt-E-Mail des Anfragenden vorhanden ist.`,
          response_json_schema: {
            type: 'object',
            properties: {
              is_inquiry: { type: 'boolean' },
              confidence: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
              contact_name: { type: 'string' },
              contact_email: { type: 'string' },
              contact_phone: { type: 'string' },
              company_name: { type: 'string' },
              inquiry_summary: { type: 'string', description: '2-3 Sätze: was wird angefragt' },
              is_existing_customer: { type: 'boolean' },
              matched_customer: { type: 'string', description: 'Exakter Name aus der Bestandskundenliste, sonst leer' },
              reason: { type: 'string', description: 'Kurze Begründung der Einstufung' },
            },
            required: ['is_inquiry', 'confidence'],
          },
        });

        stats.checked++;

        if (!analysis.is_inquiry) {
          if (looksLikeFormMail) {
            // Sicherheitsnetz: Formular-Mails nie stillschweigend verwerfen — immer in den Posteingang
            await db.CrmInboxItem.create({
              source: 'email',
              email_message_id: `thread:${t.id}`,
              sender_name: analysis.contact_name || firstIn.from_name || '',
              sender_email: analysis.contact_email || '',
              sender_phone: analysis.contact_phone || '',
              subject: (t.subject || '').slice(0, 200),
              body: `⚠️ Website-Formular-Mail, von der KI nicht als Anfrage eingestuft (${analysis.reason || 'ohne Begründung'}) — bitte manuell prüfen.\n\n---\n${bodyText.slice(0, 2000)}`,
              received_at: firstIn.received_at ? new Date(String(firstIn.received_at).slice(0, 19).replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString(),
              suggested_pipeline: 'unknown',
              status: 'new',
            });
            stats.needs_review++;
          } else {
            await markChecked(db, t, analysis.reason || 'inhaltlich keine Anfrage');
          }
          continue;
        }

        stats.inquiries++;
        const matchedCustomer = analysis.is_existing_customer && customers.includes(analysis.matched_customer) ? analysis.matched_customer : '';
        const inboxItem = await db.CrmInboxItem.create({
          source: 'email',
          email_message_id: `thread:${t.id}`,
          sender_name: analysis.contact_name || firstIn.from_name || '',
          sender_email: analysis.contact_email || firstIn.from || '',
          sender_phone: analysis.contact_phone || '',
          subject: (t.subject || '').slice(0, 200),
          body: `${analysis.inquiry_summary || ''}\n\n---\n${bodyText.slice(0, 2000)}`.trim(),
          received_at: firstIn.received_at ? new Date(String(firstIn.received_at).slice(0, 19).replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString(),
          suggested_pipeline: matchedCustomer ? 'existing_customer' : 'new_business',
          matched_customer_name: matchedCustomer,
          status: 'new',
        });

        if (analysis.confidence !== 'hoch') { stats.needs_review++; continue; }

        // Sicherer Treffer: Deal automatisch anlegen
        const deal = await db.CrmDeal.create({
          pipeline: matchedCustomer ? 'existing_customer' : 'new_business',
          stage: matchedCustomer ? 'inquiry_received' : 'new_lead',
          title: (t.subject || `Anfrage ${analysis.company_name || analysis.contact_name || ''}`).slice(0, 200).trim(),
          company_name: analysis.company_name || matchedCustomer || '',
          contact_name: analysis.contact_name || firstIn.from_name || '',
          contact_email: analysis.contact_email || firstIn.from || '',
          contact_phone: analysis.contact_phone || '',
          source: 'email',
          description: `${analysis.inquiry_summary || ''}\n\nOriginal-Anfrage:\n${bodyText.slice(0, 2000)}`.trim(),
          linked_customer_name: matchedCustomer,
        });
        await db.CrmInboxItem.update(inboxItem.id, { status: 'converted', linked_deal_id: deal.id });
        await db.CrmActivity.create({
          deal_id: deal.id,
          activity_type: 'system',
          title: 'Lead automatisch aus E-Mail-Anfrage angelegt',
          content: `Erkannt durch KI-Postfach-Prüfung (Sicherheit: hoch).\nBetreff: ${t.subject || '—'}\nAbsender: ${firstIn.from_name || ''} <${firstIn.from || ''}>\n${analysis.reason ? `Einstufung: ${analysis.reason}` : ''}`.trim(),
          activity_date: new Date().toISOString(),
        });
        stats.deals_created++;

        // Recherche zu Firma & Ansprechpartner (LinkedIn, Stammdaten) direkt anstoßen
        try {
          await base44.functions.invoke('enrichCrmLead', { deal_id: deal.id });
        } catch (e) {
          stats.errors.push(`Recherche für Deal ${deal.id} fehlgeschlagen: ${e.message}`);
        }
      } catch (e) {
        stats.errors.push(`Thread ${t.id}: ${e.message}`);
      }
    }

    return Response.json({ success: true, ...stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});