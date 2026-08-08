import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet } from '../../shared/emailDb.ts';

// Erzeugt einen Antwort-ENTWURF auf eine eingegangene Anfrage.
// Grundlage ist ausschließlich der Text des eingegangenen Verlaufs — kein Versand.
// intent: 'terminvorschlag' (weitere später ergänzbar).
export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { threadId, intent = 'terminvorschlag', params = {} } = await req.json();
    if (!threadId) return Response.json({ error: 'threadId erforderlich' }, { status: 400 });
    if (intent !== 'terminvorschlag') {
      return Response.json({ error: `Unbekannter Antworttyp: ${intent}` }, { status: 400 });
    }

    const slots = (params.slots || []).map((s: string) => String(s || '').trim()).filter(Boolean);
    if (slots.length === 0) {
      return Response.json({ error: 'Bitte Terminslots angeben — es werden keine Termine erfunden.' }, { status: 400 });
    }

    const detail = await emailDbGet('thread', { id: threadId, msgs: 10, full: 1 });
    const subject = detail?.thread?.subject || '';
    const messages = (detail?.messages || []).filter(
      (m: any) => !String(m.from || '').toLowerCase().includes('microsoftexchange'),
    );
    const inbound = messages.filter((m: any) => m.direction === 'in');
    const source = (inbound.length ? inbound : messages).slice(0, 4);
    if (source.length === 0) {
      return Response.json({ error: 'Der Verlauf enthält keine lesbare Anfrage.' }, { status: 400 });
    }

    const senderName = source[0]?.from_name || '';
    const senderMail = source[0]?.from || '';
    const conversation = source
      .map((m: any) => `[${m.direction === 'in' ? 'KUNDE' : 'WIR'}] ${m.from_name || m.from}:\n${String(m.text || m.preview || '').slice(0, 3000)}`)
      .join('\n\n---\n\n');

    const formatLabels: Record<string, string> = {
      vor_ort: 'vor Ort', telefon: 'telefonisch', video: 'per Videocall',
    };
    const formatLabel = formatLabels[params.format] || '';

    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `Du schreibst als Mitarbeiter der Digitalagentur Rittler & Co (Österreich) eine Antwort-E-Mail auf Deutsch, per Sie, professionell und persönlich.

AUFGABE: Auf die unten stehende Anfrage antworten und einen Termin vorschlagen.
Regeln:
- Greife das KONKRETE Anliegen aus der Anfrage in eigenen Worten auf (mindestens ein Satz, der zeigt, dass die Anfrage gelesen wurde). Erfinde nichts, was nicht in der Anfrage steht.
- Sprich die Person mit ihrem Namen an, sofern er erkennbar ist${senderName ? ` (Absender: ${senderName})` : ''}.
- Biete GENAU diese Termine an, wortgleich in Datum und Uhrzeit, als Aufzählung:
${slots.map((s) => `  - ${s}`).join('\n')}
${formatLabel ? `- Format des Termins: ${formatLabel}.` : ''}
- Bitte um kurze Bestätigung, welcher Termin passt.
- KEINE Preise, keine Aufwandsschätzungen, keine Zusagen zu Leistungen.
- Kein Markdown, keine Sternchen oder Rauten. Grußformel: "Beste Grüße" und darunter ${user.full_name || 'Rittler & Co'}, Rittler & Co.

BETREFF DER ANFRAGE: ${subject || '—'}

ANFRAGE (Originaltext):
"""
${conversation}
"""`,
      response_json_schema: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Betreffzeile der Antwort' },
          body: { type: 'string', description: 'Vollständiger E-Mail-Text' },
        },
        required: ['subject', 'body'],
      },
    });

    return Response.json({
      subject: res.subject || (subject ? `Re: ${subject}` : 'Terminvorschlag'),
      body: res.body || '',
      recipient: senderMail,
      thread_subject: subject,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}