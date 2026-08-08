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

AUFBAU (exakt einhalten, jeder Block durch EINE Leerzeile getrennt):
1. Anrede, z.B. "Guten Tag Frau Muster," — eigene Zeile.
2. Ein kurzer Absatz (1–2 Sätze), der das Anliegen aufgreift.
3. Ein kurzer Satz, der zum Termin überleitet, z.B. "Für ein Gespräch schlage ich folgende Termine vor:".
4. Die Termine — jeder Termin in EINER eigenen Zeile, beginnend mit "- ", sonst nichts.
5. Ein kurzer Satz mit der Bitte um Rückmeldung.
6. "Beste Grüße" — eigene Zeile.
7. ${user.full_name || 'Rittler & Co'} — eigene Zeile, darunter "Rittler & Co" — eigene Zeile.

FORMAT: reiner Fließtext. Keine Sternchen, keine Rauten, keine Trennlinien, kein Markdown, keine Überschriften, keine Emojis. Kein Absatz länger als 3 Zeilen. Keine doppelten Leerzeilen.

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

    // Sicherheitsnetz: Markdown-Reste entfernen, Aufzählungen vereinheitlichen,
    // Leerzeilen normalisieren — der Kunde bekommt sauberen Fließtext.
    const cleanBody = String(res.body || '')
      .split('\n')
      .filter((l: string) => !/^\s*([-_*]\s*){3,}\s*$/.test(l))
      .map((l: string) =>
        l
          .replace(/^#{1,6}\s+/, '')
          .replace(/^\s*[•*–]\s+/, '- ')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/\*(.+?)\*/g, '$1')
          .replace(/`(.+?)`/g, '$1')
          .trimEnd(),
      )
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return Response.json({
      subject: String(res.subject || '').replace(/[*#`]/g, '').trim() || (subject ? `Re: ${subject}` : 'Terminvorschlag'),
      body: cleanBody,
      recipient: senderMail,
      thread_subject: subject,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}