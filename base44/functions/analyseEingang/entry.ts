import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet, emailDbEnrich } from '../../shared/emailDb.ts';
import { isInternalDomain, isSystemDomain, isFreemailDomain, domainOf } from '../../shared/senderLists.js';
import { findDuplicateDeal, CLOSED_STAGES } from '../../shared/crmDuplicate.js';
import { INQUIRY_TYPES, BUYING_SIGNALS, FORM_REGEX, REQUEST_NATURES, suggestAction } from '../../shared/leadScoring.js';
import { ESCALATION_LEVELS, severityOf, upsertEscalation } from '../../shared/escalation.js';
import { resolveRecipient } from '../../shared/mailRecipient.js';

// EIN Lauf für den gesamten Eingang: pro Thread ein einziger KI-Aufruf, dessen
// Ergebnis in beide Ziele geht — Kommunikationsfelder in die E-Mail-Datenbank,
// Lead-Verdacht in den CRM-Posteingang.
// Ein Deal entsteht automatisch NUR aus einer Website-Formular-Anfrage.

const CATEGORIES = ['abnahme_freigabe', 'rechnung_zahlung', 'reklamation', 'anforderung_change', 'terminabstimmung', 'rueckfrage_antwort', 'sonstiges'];
const STATUSES = ['offen', 'beantwortet', 'erledigt', 'wartet_auf_kunde'];

const toIso = (s) =>
  s ? new Date(String(s).slice(0, 19).replace(' ', 'T') + 'Z').toISOString() : new Date().toISOString();

Deno.serve(async (req) => {
  const startedAt = new Date().toISOString();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });
    const db = base44.asServiceRole.entities;

    const payload = await req.json().catch(() => ({}));
    const days = payload.days || 14;
    const maxLlm = payload.max_llm || 40;

    const stats = {
      threads_new: 0, checked: 0, llm_calls: 0, lead_verdacht: 0, support_faelle: 0,
      form_leads: 0, skipped_limit: 0, errors: [] as string[],
    };

    // 1. Ledger: bereits geprüfte Threads überspringen
    // Ein Fehlversuch sperrt den Thread NICHT — erst ab dem dritten wird er übersprungen.
    const ledger = await db.EmailScanLedger.list('-checked_at', 3000);
    const failEntries = new Map<string, any>();
    const seen = new Set<string>();
    for (const l of ledger) {
      const id = String(l.thread_id || '');
      if (!id) continue;
      if (l.outcome === 'fehler') {
        if (!failEntries.has(id)) failEntries.set(id, l);
        if ((l.fail_count || 0) >= 3) seen.add(id);
      } else {
        seen.add(id);
      }
    }

    const listing = await emailDbGet('threads', { days, limit: 150 });
    const threads = (listing.results || []).filter((t) => !seen.has(String(t.id)));
    stats.threads_new = threads.length;

    const projects = await db.LiquidityProject.list('-updated_date', 500);
    const customers = [...new Set(projects.map((p) => p.customer).filter(Boolean))];
    const allDeals = await db.CrmDeal.list('-updated_date', 500);
    const openDeals = allDeals.filter((d) => !CLOSED_STAGES.includes(d.stage));

    // Deterministischer Kundendomain-Index: Domain -> Kundenname.
    // Quellen: gewonnene/beauftragte Deals und laufende Verträge. Freemail zählt nicht.
    const domainIndex = new Map<string, string>();
    for (const d of allDeals) {
      if (!['won', 'ordered'].includes(d.stage)) continue;
      const dom = domainOf(d.contact_email);
      if (!dom || isFreemailDomain(dom) || isInternalDomain(dom) || isSystemDomain(dom)) continue;
      const name = d.linked_customer_name || d.company_name;
      if (name && !domainIndex.has(dom)) domainIndex.set(dom, name);
    }
    const contracts = await db.RecurringContract.list('-updated_date', 500);
    for (const c of contracts) {
      const dom = String(c.domain || '').toLowerCase().trim().replace(/^www\./, '');
      if (dom && c.customer && !domainIndex.has(dom)) domainIndex.set(dom, c.customer);
    }

    const note = async (threadId, outcome, reason, extra = {}) => {
      await db.EmailScanLedger.create({
        thread_id: String(threadId), checked_at: new Date().toISOString(),
        outcome, reason: String(reason || '').slice(0, 500), ...extra,
      });
    };

    for (const t of threads) {
      // Threads über dem Limit NICHT als geprüft vermerken — sie kommen im nächsten Lauf dran
      if (stats.llm_calls >= maxLlm) { stats.skipped_limit++; continue; }
      try {
        const detail = await emailDbGet('thread', { id: t.id, msgs: 10, full: 1 });
        const msgs = detail.messages || [];
        if (!msgs.length) { await note(t.id, 'kein_geschaeft', 'keine Nachrichten'); stats.checked++; continue; }

        let firstIn = [...msgs].reverse().find((m) => m.direction === 'in');
        const oldest = msgs[msgs.length - 1];
        const isFormMail = FORM_REGEX.test(`${t.subject || ''} ${(firstIn || oldest)?.text || ''}`);
        if (!firstIn && isFormMail) firstIn = oldest;
        if (!firstIn) { await note(t.id, 'kein_geschaeft', 'keine eingehende Nachricht'); stats.checked++; continue; }

        const domain = domainOf(firstIn.from);
        if (isSystemDomain(domain)) { await note(t.id, 'kein_geschaeft', 'System-/Tool-Absender'); stats.checked++; continue; }
        if (!isFormMail && isInternalDomain(domain)) { await note(t.id, 'kein_geschaeft', 'interner Absender'); stats.checked++; continue; }

        const convo = msgs
          .map((m) => `[${m.direction === 'in' ? 'KUNDE' : m.direction === 'out' ? 'WIR' : 'INTERN'}] ${m.from_name || m.from} (${m.received_at}):\n${(m.text || m.preview || '').slice(0, 2500)}`)
          .join('\n\n---\n\n')
          .slice(0, 25000);

        stats.llm_calls++;
        const r = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Du bist der E-Mail-Analyst der Digitalagentur Rittler & Co (rittler.co / rico-office.at). Analysiere diese Konversation EINMAL für zwei Zwecke: Kommunikationsauswertung und Einstufung als Geschäftsanfrage. Antworte auf Deutsch, präzise, nichts erfinden.

BEKANNTE KUNDEN (für die Zuordnung exakt einen dieser Namen verwenden, wenn er passt):
${customers.slice(0, 200).join(', ')}

BETREFF: ${t.subject || '—'}
ERSTE EINGEHENDE NACHRICHT VON: ${firstIn.from_name || ''} <${firstIn.from || ''}>
${isFormMail ? 'HINWEIS: Diese Mail stammt vom eigenen Website-Kontaktformular. Sie versendet über unsere eigene Adresse und ist trotzdem eine echte externe Anfrage.' : ''}

KONVERSATION (neueste zuerst):
"""
${convo}
"""

TEIL 1 — KOMMUNIKATION
- Spam, Newsletter, Werbung, Cold-Outreach: category "sonstiges", status "erledigt", summary "Spam/Werbung — nicht relevant", escalation_level "keine", customer_normalized leer.
- Interne/System-Mails ohne Kundenbeteiligung: status "erledigt", escalation_level "keine", summary "Intern/System — kein Handlungsbedarf".
- Website-Formular-Anfragen: category "anforderung_change", status "offen", summary mit den Kerndaten (wer, was wird angefragt).
- escalation_level mit escalation_evidence (wörtliche Textstelle, wie bei buying_signals):
  keine — sachlicher Ton, kein Konflikt
  stufe1 — Unmut oder Ungeduld, noch sachlich
  stufe2 — klare Beschwerde, Fristsetzung, spürbarer Konflikt
  stufe3 — Eskalation, Abbruch- oder Rechtsandrohung, Chef im CC, scharfer Ton
- Absender mit @rittler.co oder @rico-office.at sind unsere Kollegen. Hat ein Kollege nach der letzten Kundenanfrage inhaltlich geantwortet: status "beantwortet" und colleague_replied true. status "offen" NUR bei unbeantworteter Kundenanfrage. Interne Weiterleitungen zählen NICHT als beantwortet.
- customer_normalized: exakter Listenname, sonst Firmenname aus der Kundendomain (office@holzbau-maier.at -> "Holzbau Maier"). Bei Freemail-, internen und System-Absendern leer. Themen- oder Branchenähnlichkeit reicht NICHT.

TEIL 2 — EINSTUFUNG
inquiry_type: genau einer aus
  angebotsanfrage — neue Projekt-/Leistungsanfrage
  erweiterung_bestandskunde — Bestandskunde fragt zusätzliche Leistung an
  laufende_projektkommunikation — Abstimmung in laufenden Projekten
  support_stoerung — Störung, Fehler, Support
  verwaltung — Rechnungen, Buchhaltung, Organisatorisches
  kein_geschaeft — Spam, Werbung, Newsletter, Bewerbungen, System-Mails

buying_signals: gib NUR belegte Signale zurück, jedes mit einer kurzen wörtlichen Textstelle aus der Mail als Beleg. Nichts annehmen, nichts ergänzen. Mögliche Signale:
  konkreter_gegenstand — es ist klar, WAS gewünscht wird
  beschaffungsabsicht — es soll etwas beauftragt/gekauft werden
  zeit_oder_budgetrahmen — Termin, Zeitraum oder Budget genannt
  absender_zurechenbar — Absender ist einer Firma/Person klar zuordenbar
  erreichbarkeit — Telefonnummer, Rückrufbitte oder Terminwunsch vorhanden

request_nature: Art des Anliegens, genau eine, IMMER mit wörtlicher Textstelle als Beleg (request_nature_evidence):
  stoerung — etwas funktioniert nicht (Fehler, Ausfall)
  aenderung_bestehend — Änderung/Anpassung/kleine Ergänzung an einer BEREITS BESTEHENDEN Website/Anwendung des Absenders (Texte, Bilder, Öffnungszeiten, Banner, Unterseite, Plugin-Update, Wartung)
  neue_leistung — eigenständiges NEUES Projekt/Produkt, erst zu kalkulieren
  sonstiges — trifft nichts davon
Hinweis: Änderung an etwas, das der Kunde schon von uns hat = aenderung_bestehend. Ein neues, eigenständiges Vorhaben = neue_leistung.

Extrahiere zusätzlich die Kontaktdaten AUS DEM TEXT (nichts erfinden).`,
          response_json_schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              category: { type: 'string', enum: CATEGORIES },
              status: { type: 'string', enum: STATUSES },
              escalation_level: { type: 'string', enum: ESCALATION_LEVELS },
              escalation_evidence: { type: 'string', description: 'wörtliche Textstelle als Beleg' },
              colleague_replied: { type: 'boolean' },
              customer_normalized: { type: 'string' },
              inquiry_type: { type: 'string', enum: INQUIRY_TYPES },
              request_nature: { type: 'string', enum: REQUEST_NATURES },
              request_nature_evidence: { type: 'string', description: 'wörtliche Textstelle als Beleg' },
              buying_signals: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    signal: { type: 'string', enum: BUYING_SIGNALS },
                    evidence: { type: 'string', description: 'kurze Textstelle aus der Mail' },
                  },
                },
              },
              contact_name: { type: 'string' },
              contact_email: { type: 'string' },
              contact_phone: { type: 'string' },
              company_name: { type: 'string' },
              matched_customer: { type: 'string' },
              reason: { type: 'string', description: 'Kurze Begründung der Einstufung' },
            },
            required: ['inquiry_type'],
          },
        });
        stats.checked++;

        // Deterministische Kundenerkennung — Index vor KI
        const rawSignals = (r.buying_signals || []).map((s) => s?.signal).filter(Boolean);
        const freemail = isFreemailDomain(domain);
        const indexHit = freemail ? '' : (domainIndex.get(domain) || '');
        const matchedCustomer = customers.includes(r.matched_customer) ? r.matched_customer : '';
        let isKnownCustomer = Boolean(indexHit);
        let customerMatch = indexHit ? 'sicher' : 'unbekannt';
        if (!isKnownCustomer && freemail && matchedCustomer) {
          isKnownCustomer = true;
          customerMatch = 'unsicher';
        }
        const customerName = indexHit || matchedCustomer;
        const requestNature = REQUEST_NATURES.includes(r.request_nature) ? r.request_nature : 'sonstiges';
        const severity = severityOf(r.escalation_level);
        const suggested = suggestAction({
          is_known_customer: isKnownCustomer,
          request_nature: requestNature,
          inquiry_type: r.inquiry_type,
          signals: rawSignals,
        });

        // Ziel 1: Kommunikationsfelder in die E-Mail-Datenbank
        try {
          const fields: Record<string, unknown> = {
            summary: r.summary || '',
            category: CATEGORIES.includes(r.category) ? r.category : 'sonstiges',
            status: (() => {
              const s = STATUSES.includes(r.status) ? r.status : 'offen';
              return r.colleague_replied && s === 'offen' ? 'beantwortet' : s;
            })(),
            eskalation: severity > 0 ? 1 : 0,
            zuordnung_status: 'automatisch',
            klass_modell: 'base44-eingang',
            suggested_action: suggested,
            request_nature: requestNature,
            request_nature_evidence: String(r.request_nature_evidence || '').slice(0, 300),
            is_known_customer: isKnownCustomer ? 1 : 0,
            matched_customer_name: customerName,
            customer_match: customerMatch,
          };
          if (String(r.customer_normalized || '').trim()) fields.customer_normalized = String(r.customer_normalized).trim();
          await emailDbEnrich(t.id, fields);
        } catch (e) {
          stats.errors.push(`E-Mail-DB Thread ${t.id}: ${e.message}`);
        }

        // Eskalation als eigener Vorgang — Bearbeitungsstand bleibt erhalten
        if (severity > 0) {
          try {
            await upsertEscalation(db, {
              threadId: t.id,
              subject: t.subject || '',
              customerName: customerName || String(r.customer_normalized || '').trim(),
              severity,
              evidence: r.escalation_evidence || '',
            });
          } catch (e) {
            stats.errors.push(`Eskalation Thread ${t.id}: ${e.message}`);
          }
        }

        if (suggested === 'supportticket') stats.support_faelle++;
        if (suggested === 'anfrage') stats.lead_verdacht++;

        const contactEmail = String(r.contact_email || (isFormMail ? '' : firstIn.from) || '').trim();
        const bodyText = (firstIn.text || '').slice(0, 5000);

        // Ziel 2: Jede triage-relevante Mail landet im Posteingang — die
        // Vorklassifizierung ist eine Empfehlung, entschieden wird dort.
        if (suggested !== 'kein_lead') {
          await db.CrmInboxItem.create({
            source: 'email',
            sender_name: r.contact_name || firstIn.from_name || '',
            sender_email: contactEmail,
            sender_phone: r.contact_phone || '',
            recipient: resolveRecipient(firstIn, msgs),
            subject: t.subject || '',
            body: bodyText,
            received_at: toIso(firstIn.received_at),
            thread_id: String(t.id),
            track: suggested === 'supportticket' ? 'support' : 'lead',
            suggested_action: suggested,
            request_nature: requestNature,
            is_known_customer: isKnownCustomer,
            customer_match: customerMatch,
            matched_customer_name: customerName,
            suggested_pipeline: isKnownCustomer ? 'existing_customer' : 'new_business',
            inquiry_type: INQUIRY_TYPES.includes(r.inquiry_type) ? r.inquiry_type : undefined,
            buying_signals: (r.buying_signals || [])
              .filter((s) => s?.signal)
              .map((s) => `${s.signal} — ${String(s.evidence || '').slice(0, 200)}`),
            signal_count: rawSignals.length,
            lead_strength: rawSignals.length >= 3 ? 'stark' : 'schwach',
            status: 'new',
            decision: 'offen',
          });
        }

        // Automatische Deal-Anlage ausschließlich für Formular-Anfragen
        const duplicate = findDuplicateDeal(openDeals, {
          contactEmail, senderDomain: domainOf(contactEmail),
          companyName: r.company_name || customerName,
        });
        if (isFormMail && contactEmail && !duplicate) {
          const deal = await db.CrmDeal.create({
            pipeline: isKnownCustomer ? 'existing_customer' : 'new_business',
            stage: isKnownCustomer ? 'inquiry_received' : 'new_lead',
            title: (t.subject || `Anfrage ${r.company_name || r.contact_name || ''}`).slice(0, 200).trim(),
            company_name: r.company_name || customerName || '',
            contact_name: r.contact_name || firstIn.from_name || '',
            contact_email: contactEmail,
            contact_phone: r.contact_phone || '',
            source: 'website',
            description: `${r.summary || ''}\n\nOriginal-Anfrage:\n${bodyText.slice(0, 2000)}`.trim(),
            linked_customer_name: customerName,
            email_thread_id: String(t.id),
            enrichment_status: 'pending',
          });
          openDeals.push(deal);
          await db.CrmActivity.create({
            deal_id: deal.id, activity_type: 'system',
            title: 'Lead automatisch aus Website-Formular angelegt',
            content: `Betreff: ${t.subject || '—'}\nAbsender: ${r.contact_name || ''} <${contactEmail}>`,
            activity_date: new Date().toISOString(),
          });
          // Rückkanal in die E-Mail-Datenbank
          try {
            await emailDbEnrich(t.id, { crm_status: 'lead_angelegt', crm_deal_id: deal.id, status: 'beantwortet' });
          } catch (e) {
            stats.errors.push(`Rückkanal Thread ${t.id}: ${e.message}`);
          }
          stats.form_leads++;
        }

        await note(t.id, suggested === 'kein_lead' ? 'betrieb' : 'lead_verdacht',
          `${suggested} · ${requestNature} · ${r.reason || r.inquiry_type}`,
          { inquiry_type: r.inquiry_type });
      } catch (e) {
        // Kein "geprüft"-Vermerk: der Thread kommt im nächsten Lauf wieder dran.
        // Nur der Fehlerzähler wächst, damit ein dauerhaft defekter Thread irgendwann ruht.
        stats.errors.push(`Thread ${t.id}: ${e.message}`);
        try {
          const prev = failEntries.get(String(t.id));
          if (prev) {
            await db.EmailScanLedger.update(prev.id, {
              checked_at: new Date().toISOString(),
              reason: String(e.message || '').slice(0, 500),
              fail_count: (prev.fail_count || 0) + 1,
            });
          } else {
            const created = await db.EmailScanLedger.create({
              thread_id: String(t.id), checked_at: new Date().toISOString(),
              outcome: 'fehler', reason: String(e.message || '').slice(0, 500), fail_count: 1,
            });
            failEntries.set(String(t.id), created);
          }
        } catch (_) { /* Protokollierung darf den Lauf nicht stoppen */ }
      }
    }

    await base44.asServiceRole.entities.InboxScanRun.create({
      run_at: startedAt,
      triggered_by: user.email || '',
      threads_new: stats.threads_new,
      checked: stats.checked,
      llm_calls: stats.llm_calls,
      lead_verdacht: stats.lead_verdacht,
      form_leads: stats.form_leads,
      skipped_limit: stats.skipped_limit,
      errors: stats.errors.slice(0, 20),
    });

    return Response.json({ success: true, ...stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});