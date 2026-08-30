import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet } from '../../shared/emailDb.ts';
import { cleanMailText as cleanText } from '../../shared/mailText.ts';

// Eigener Vertrag für den KI-Assistenten am Deal. generateCrmReply bleibt unberührt.
// Antwort immer: { subject, variant_a, variant_b, body, kontext_verwendet[] }
// oder { error } mit HTTP 200 — nie leer, nie still.
const INTENTS = ['antwort', 'termin', 'angebot', 'nachfassen', 'besprechung', 'absage'];

const FORMAT: Record<string, string> = { vor_ort: 'vor Ort', telefon: 'telefonisch', video: 'per Videocall' };

const dLabel = (d: any) => new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
const slotLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} um ${d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })} Uhr`;
};

async function ladeAngebot(base44: any, deal: any) {
  if (deal?.proposal_id) {
    const p = await base44.entities.CrmProposal.get(deal.proposal_id).catch(() => null);
    if (!p) return null;
    let mapping: any = null;
    try {
      const roh = p.mapping_json || (p.mapping_json_url ? await (await fetch(p.mapping_json_url)).text() : '');
      mapping = roh ? JSON.parse(roh) : null;
    } catch { mapping = null; }
    return {
      titel: p.title || 'Angebot',
      positionen: (mapping?.positions || []).map((x: any) => ({ leistung: x.title, ergebnis: x.result || x.goal || '', preis_netto: x.price })),
      summe_netto: Number(mapping?.total_net) || Number(deal.value_net) || 0,
      gueltig_bis: '',
      pdf_url: p.pdf_url || '',
      hat_pdf: Boolean(p.pdf_url),
    };
  }
  if (deal?.quote_id) {
    const q = await base44.entities.CrmQuote.get(deal.quote_id).catch(() => null);
    if (!q) return null;
    return {
      titel: q.title || 'E-Mail-Angebot',
      positionen: (q.items || []).map((i: any) => ({ leistung: i.title, ergebnis: i.description || '', preis_netto: i.total_price })),
      summe_netto: Number(q.total_net) || 0,
      gueltig_bis: q.valid_until ? dLabel(q.valid_until) : '',
      pdf_url: '',
      hat_pdf: false,
    };
  }
  return null;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { dealId = '', intent = 'antwort', params = {}, feedback = '', previous_a = '', previous_b = '' } = await req.json();
    if (!dealId) return Response.json({ error: 'dealId erforderlich' });
    const absicht = String(intent);
    if (!INTENTS.includes(absicht)) return Response.json({ error: `Unbekannte Absicht: ${intent}` });

    const deal = await base44.entities.CrmDeal.get(dealId).catch(() => null);
    if (!deal) return Response.json({ error: 'Deal nicht gefunden.' });

    const kontext: string[] = [];
    const teile: string[] = [];

    if (deal.description) {
      teile.push(`[ANFRAGE]\n${String(deal.description).slice(0, 4000)}`);
      kontext.push('Anfragetext');
    }

    const acts = (await base44.entities.CrmActivity.filter({ deal_id: dealId }, '-activity_date', 12).catch(() => [])) || [];
    const relevant = acts.filter((a: any) => ['note', 'call', 'email', 'meeting'].includes(a.activity_type));
    relevant.forEach((a: any) => {
      teile.push(`[VERLAUF ${dLabel(a.activity_date || a.created_date)}${a.direction ? ` ${a.direction}` : ''}] ${a.title || ''}\n${String(a.content || a.body || '').slice(0, 1200)}`);
    });
    if (relevant.length) kontext.push(`${relevant.length} Verlaufseinträge`);

    const angebot = await ladeAngebot(base44, deal);
    const angebotsMail = acts.find((a: any) => a.intent === 'angebot' || String(a.title || '').startsWith('Angebots-E-Mail'));
    const gesendetAm = angebotsMail?.activity_date || angebotsMail?.created_date || null;
    const tage = gesendetAm ? Math.floor((Date.now() - new Date(gesendetAm).getTime()) / 86400000) : null;
    if (angebot) kontext.push(gesendetAm ? `Angebot vom ${dLabel(gesendetAm)}` : `Angebot „${angebot.titel}"`);

    let threadSubject = '';
    let senderMail = deal.contact_email || '';
    if (deal.email_thread_id) {
      const detail = await emailDbGet('thread', { id: deal.email_thread_id, msgs: 8, full: 1 }).catch(() => null);
      const messages = (detail?.messages || []).filter((m: any) => !String(m.from || '').toLowerCase().includes('microsoftexchange'));
      if (messages.length) {
        threadSubject = detail?.thread?.subject || '';
        senderMail = senderMail || messages.find((m: any) => m.direction === 'in')?.from || '';
        teile.push(
          `[E-MAIL-VERLAUF]\n${messages
            .slice(0, 8)
            .map((m: any) => `[${m.direction === 'in' ? 'KUNDE' : 'WIR'}] ${m.from_name || m.from}:\n${String(m.text || m.preview || '').slice(0, 2000)}`)
            .join('\n\n---\n\n')}`,
        );
        kontext.push(`E-Mail-Verlauf (${messages.length} Nachrichten)`);
      }
    }

    const conversation = teile.join('\n\n---\n\n').trim();

    // ---- Aufgabe je Absicht ---------------------------------------------
    const slots = (params.slots || []).map((s: string) => String(s || '').trim()).filter(Boolean).map(slotLabel);
    const formatLabel = FORMAT[params.format] || '';
    let task = '';
    let betreff = '';

    if (absicht === 'antwort') {
      if (!conversation) return Response.json({ error: 'Kein Anfragetext und kein Verlauf vorhanden — bitte die Anfrage am Deal erfassen.' });
      task = `AUFGABE: Auf das Anliegen inhaltlich antworten, ohne etwas zuzusagen.
AUFBAU: Anrede / Aufgreifen des Anliegens in eigenen Worten / was wir dazu sagen können, ohne Zusage / EIN konkreter nächster Schritt / Gruß.
GRENZE: keine Termine, keine Preise.
${params.stichworte ? `STICHWORTE (inhaltlich einarbeiten, nicht anhängen):\n${params.stichworte}` : ''}`;
    } else if (absicht === 'termin') {
      if (slots.length === 0) return Response.json({ error: 'Mindestens ein Termin nötig — es werden keine Termine erfunden.' });
      task = `AUFGABE: Termine für ein Gespräch vorschlagen.
AUFBAU: Anrede / Aufgreifen des Anliegens (1-2 Sätze) / Überleitung zum Gespräch${formatLabel ? ` mit Nennung des Formats (${formatLabel})` : ''} / die Termine, je Termin EINE Zeile "- <Termin>", wortgleich / Bitte um kurze Rückmeldung / Gruß.
DIE TERMINE (ausschließlich diese, wortgleich, mit Leerzeile zwischen den Punkten):
${slots.map((s: string) => `- ${s}`).join('\n\n')}
GRENZE: keine weiteren Zeitangaben, keine Dauer erfinden, kein Angebotsbezug.`;
    } else if (absicht === 'angebot') {
      if (!angebot) return Response.json({ error: 'Kein Angebot am Deal verknüpft.' });
      if (!angebot.hat_pdf && angebot.positionen.length === 0)
        return Response.json({ error: 'Das Angebot enthält noch keine freigegebenen Positionen.' });
      task = angebot.hat_pdf
        ? `AUFGABE: Anschreiben zur Übermittlung des Angebots "${angebot.titel}".
AUFBAU: kurz auf die Anfrage eingehen / den Nutzen in EINEM Satz / Hinweis, dass das vollständige Angebot ${params.pdf_link ? 'verlinkt ist' : 'beiliegt'} / Einladung zum nächsten Schritt / Gruß.
GRENZE: KEINE Detailpreise im Text.`
        : `AUFGABE: Die E-Mail trägt das Angebot "${angebot.titel}" selbst.
AUFBAU: Bezug (1 Satz) / "Leistungen:" — je Position "Leistung - Ergebnis - Preis netto" / "Summe:" netto${angebot.gueltig_bis ? ` / Gültigkeit: exakt der Satz "Dieses Angebot gilt bis ${angebot.gueltig_bis}."` : ''} / EIN konkreter nächster Schritt / Gruß.
GRENZE: ausschließlich diese Positionen und Preise, keine Ergänzung, kein Rabatt.
FREIGEGEBENE POSITIONEN (einzige Quelle):
${JSON.stringify({ positionen: angebot.positionen, summe_netto: angebot.summe_netto }, null, 2)}`;
    } else if (absicht === 'nachfassen') {
      if (!angebot) return Response.json({ error: 'Kein Angebot am Deal verknüpft.' });
      if (!gesendetAm)
        return Response.json({ error: 'Kein Übermittlungsdatum bekannt — bitte das Versanddatum des Angebots nachtragen.' });
      betreff = `Unser Angebot „${angebot.titel}" — kurze Nachfrage`;
      task = `AUFGABE: Kurze, freundliche Nachfrage zum Stand des übermittelten Angebots "${angebot.titel}". KEINE Termine.
AUFBAU, streng in dieser Reihenfolge:
1. Anrede.
2. EIN Satz, der das ursprüngliche Anliegen des Kunden in SEINEN Worten aufgreift.
3. Bezug auf das Angebot: Titel und Übermittlungsdatum ${dLabel(gesendetAm)} — ohne Preiswiederholung.
4. Die Nachfrage selbst, sachlich und ohne Druck: wie der Stand ist, ob Fragen offen sind, verbunden mit dem Angebot, offene Punkte kurz zu klären.
${params.schwerpunkt ? `5. Diesen Schwerpunkt eingearbeitet, nicht angehängt: ${params.schwerpunkt}` : ''}
6. EIN Satz, der ein "derzeit nicht die Priorität" ausdrücklich zulässt.
7. Gruß.
GRENZE: keine Terminvorschläge, kein Rabatt, keine Frist, keine Ablaufdrohung, keine Wiederholung der Positionsliste. Endet mit einer offenen Frage.`;
    } else if (absicht === 'besprechung') {
      if (!angebot) return Response.json({ error: 'Kein Angebot am Deal verknüpft.' });
      if (slots.length === 0) return Response.json({ error: 'Mindestens ein Termin nötig — es werden keine Termine erfunden.' });
      betreff = `Unser Angebot „${angebot.titel}" — kurzes Gespräch?`;
      task = `AUFGABE: Eine Besprechung zum übermittelten Angebot "${angebot.titel}" vorschlagen.
AUFBAU, streng in dieser Reihenfolge:
1. Anrede.
2. DER BOGEN: EIN Satz, der das ursprüngliche Anliegen des Kunden in SEINEN Worten aufgreift — woran ihm gelegen war, nicht "wir haben Ihnen ein Angebot geschickt".
3. Bezug zum Angebot: Titel${gesendetAm ? ` und Übermittlungsdatum ${dLabel(gesendetAm)}` : ''}, in einem Halbsatz, worauf es zugeschnitten ist. KEINE Preiswiederholung.
4. Die Zeitspanne sachlich benennen${tage != null ? ` ("seither sind ${tage} Tage vergangen")` : ''}, ohne Vorwurf, mit der Deutung, dass offene Fragen sich schriftlich schlecht klären lassen.
${params.schwerpunkt ? `5. Diesen Schwerpunkt eingearbeitet, nicht angehängt: ${params.schwerpunkt}` : ''}
6. DER VORSCHLAG: ein kurzes Gespräch${formatLabel ? ` ${formatLabel}` : ''}, danach die Termine als Aufzählung, je Termin EINE Zeile "- <Termin>", wortgleich.
7. EIN Satz, der ein "derzeit nicht die Priorität" ausdrücklich zulässt.
8. Gruß.
DIE TERMINE (ausschließlich diese, wortgleich, mit Leerzeile zwischen den Punkten):
${slots.map((s: string) => `- ${s}`).join('\n\n')}
GRENZE: kein Rabatt, keine Frist, keine Drohung mit Ablauf, keine Wiederholung der Positionsliste. Freundlich bleiben — die Tagesanzahl wird genannt, nicht vorgeworfen.`;
    } else if (absicht === 'absage') {
      const grund = String(params.grund || '').trim();
      if (!grund) return Response.json({ error: 'Ohne Grund keine Absage.' });
      task = `AUFGABE: Die Anfrage absagen.
AUFBAU: Anrede / Dank für die Anfrage / die Absage klar im ersten Drittel, mit dem sachlichen Grund / optional Hinweis auf einen späteren Zeitpunkt / Gruß.
GRENZE: keine Schuldzuweisung, kein Bedauern über mehrere Sätze.
DER GRUND: ${grund}`;
    }

    const preisFrei = absicht === 'angebot';
    const signatur = user.full_name || 'Rittler & Co';

    const prompt = `Du schreibst als ${signatur} von der Digitalagentur Rittler & Co (Österreich) eine E-Mail an ${deal.contact_name || 'den Kunden'}${deal.company_name ? ` von ${deal.company_name}` : ''}.

TONALITÄT (gilt immer):
- Deutsch, per Sie. Herzlich und wertschätzend, aber knapp.
- Kein Markdown, keine Sternchen, keine Rauten, keine Emojis, keine Trennlinien.
- Aufzählungen: jede Position beginnt mit "- " und steht in einer eigenen Zeile. Zwischen zwei Aufzählungspunkten steht eine LEERZEILE. Vor und nach der Aufzählung steht ebenfalls eine Leerzeile.
- Kein Absatz länger als drei Zeilen.
- Absätze mit echten Zeilenumbrüchen, zwischen zwei Absätzen genau eine Leerzeile.
${preisFrei ? '' : '- VERBOTEN: Preise, Aufwandsschätzungen, Liefertermine, Rabatte, Zusagen zu Leistungen.\n'}- VERBOTEN: erfundene Termine, erfundene Personen, Platzhalter wie [Name].
- Schluss immer drei eigene Zeilen: "Beste Grüße" / ${signatur} / "Rittler & Co".

${task}

ZWEI VARIANTEN, inhaltlich identisch, unterschiedliche Länge und Haltung:
- variant_a: kompakt und direkt, 90-130 Wörter
- variant_b: ausführlicher und beratend, 170-230 Wörter
Beide nennen dieselben Termine, Preise und Zusagen.
${feedback ? `
ÜBERARBEITUNG — verbindlicher Änderungswunsch: "${feedback}"
Formulierung, Ton und Betonung ändern sich. Harte Angaben (Termine, Preise, Positionen) bleiben unverändert.
BISHERIGE VARIANTE A:
"""
${previous_a}
"""
BISHERIGE VARIANTE B:
"""
${previous_b}
"""` : ''}

BETREFF DES VERLAUFS: ${threadSubject || '—'}

BELEGTER KONTEXT (einzige inhaltliche Quelle):
"""
${conversation || '(kein Verlauf vorhanden)'}
"""`;

    const res = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Betreffzeile' },
          variant_a: { type: 'string', description: 'kompakte Variante' },
          variant_b: { type: 'string', description: 'ausführliche Variante' },
        },
        required: ['subject', 'variant_a', 'variant_b'],
      },
    });

    const a = cleanText(res.variant_a);
    const b = cleanText(res.variant_b);
    if (!a && !b) return Response.json({ error: 'Das Modell hat keinen verwertbaren Text geliefert — bitte erneut versuchen.' });

    return Response.json({
      subject: betreff || String(res.subject || '').replace(/[*#`]/g, '').trim() || (threadSubject ? `Re: ${threadSubject}` : 'Ihre Anfrage'),
      variant_a: a || b,
      variant_b: b || a,
      body: a || b,
      recipient: senderMail,
      kontext_verwendet: kontext,
    });
  } catch (error) {
    return Response.json({ error: error.message });
  }
}