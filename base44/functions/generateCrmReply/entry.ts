import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { emailDbGet } from '../../shared/emailDb.ts';

// Erzeugt zwei Antwort-ENTWÜRFE (kompakt / ausführlich) für eine Absicht am Deal.
// Grundlage ist ausschließlich belegter Text: E-Mail-Verlauf oder Anfrage + Verlaufseinträge.
// Kein Versand, keine erfundenen Termine, Preise oder Zusagen.
const INTENTS = ['antwort', 'terminvorschlag', 'angebot', 'nachfassen', 'angebot_nachfrage', 'rueckfrage', 'absage'];

const cleanText = (raw: string) =>
  String(raw || '')
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

const eur = (n: number) => `${Math.round(Number(n) || 0).toLocaleString('de-AT')} €`;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { threadId = '', dealId = '', intent = 'antwort', params = {}, feedback = '', previous_a = '', previous_b = '' } = body;
    if (!dealId) return Response.json({ error: 'dealId erforderlich' }, { status: 400 });
    if (!INTENTS.includes(intent)) return Response.json({ error: `Unbekannte Absicht: ${intent}` }, { status: 400 });

    // ---- Quelle des Entwurfs ---------------------------------------------
    let source = 'deal';
    let subject = '';
    let senderName = '';
    let senderMail = '';
    let conversation = '';

    if (threadId) {
      const detail = await emailDbGet('thread', { id: threadId, msgs: 10, full: 1 }).catch(() => null);
      const messages = (detail?.messages || []).filter(
        (m: any) => !String(m.from || '').toLowerCase().includes('microsoftexchange'),
      );
      const inbound = messages.filter((m: any) => m.direction === 'in');
      const picked = (inbound.length ? inbound : messages).slice(0, 4);
      if (picked.length > 0) {
        source = 'thread';
        subject = detail?.thread?.subject || '';
        senderName = picked[0]?.from_name || '';
        senderMail = picked[0]?.from || '';
        conversation = picked
          .map((m: any) => `[${m.direction === 'in' ? 'KUNDE' : 'WIR'}] ${m.from_name || m.from}:\n${String(m.text || m.preview || '').slice(0, 3000)}`)
          .join('\n\n---\n\n');
      }
    }

    const deal = await base44.entities.CrmDeal.get(dealId).catch(() => null);

    if (!conversation) {
      const acts = await base44.entities.CrmActivity.filter({ deal_id: dealId }, '-activity_date', 30).catch(() => []);
      const relevant = (acts || [])
        .filter((a: any) => ['note', 'call', 'email', 'meeting'].includes(a.activity_type))
        .slice(0, 10);
      const parts: string[] = [];
      if (deal?.description) parts.push(`[ANFRAGE]\n${String(deal.description).slice(0, 4000)}`);
      relevant.forEach((a: any) => {
        const text = String(a.content || a.body || '').slice(0, 1500);
        parts.push(`[VERLAUF ${new Date(a.activity_date || a.created_date).toLocaleDateString('de-AT')}] ${a.title || ''}\n${text}`);
      });
      conversation = parts.join('\n\n---\n\n').trim();
      senderName = deal?.contact_name || '';
      senderMail = deal?.contact_email || '';
    }

    // Ohne belegten Verlauf tragen die Stichworte den Entwurf.
    if (!conversation && String(params.stichworte || '').trim()) {
      conversation = `[STICHWORTE DER PERSON]\n${String(params.stichworte).slice(0, 4000)}`;
    }

    if (!conversation) {
      return Response.json(
        { error: 'Kein Anfragetext vorhanden — bitte die Anfrage am Deal erfassen oder Stichworte angeben.' },
        { status: 400 },
      );
    }

    // ---- Aufgabe je Absicht ----------------------------------------------
    const slots = (params.slots || []).map((s: string) => String(s || '').trim()).filter(Boolean);
    const angebot = params.angebot || {};
    const positionen = angebot.positionen || [];
    let task = '';

    if (intent === 'terminvorschlag') {
      if (slots.length === 0) {
        return Response.json({ error: 'Mindestens ein Termin nötig — es werden keine Termine erfunden.' }, { status: 400 });
      }
      const formatLabels: Record<string, string> = { vor_ort: 'vor Ort', telefon: 'telefonisch', video: 'per Videocall' };
      const formatLabel = formatLabels[params.format] || '';
      task = `AUFGABE: Auf die Anfrage antworten und Termine vorschlagen.
AUFBAU: Anrede / Dank und Aufgreifen des Anliegens (2-3 Sätze) / EIN Satz Überleitung zum Termin${formatLabel ? ` mit Nennung des Formats (${formatLabel})` : ''} / die Termine, je Termin EINE Zeile "- <Termin>", wortgleich / Bitte um kurze Rückmeldung und Angebot einer Alternative / Gruß.
DIE TERMINE (wortgleich, ausschließlich diese):
${slots.map((s) => `- ${s}`).join('\n')}
GRENZE: keine weiteren Zeitangaben, keine Dauer erfinden.`;
    } else if (intent === 'antwort') {
      task = `AUFGABE: Auf die Anfrage inhaltlich antworten, ohne etwas zuzusagen.
AUFBAU: Anrede / Dank und Aufgreifen des Anliegens / was wir dazu sagen können, ohne Zusage / EIN konkreter nächster Schritt / Gruß.
GRENZE: keine Termine, keine Preise.
${params.stichworte ? `STICHWORTE (inhaltlich einarbeiten, nicht anhängen):\n${params.stichworte}` : ''}`;
    } else if (intent === 'angebot') {
      if (angebot.hat_pdf) {
        task = `AUFGABE: Anschreiben zur Übermittlung des Angebots "${angebot.titel || ''}".
AUFBAU: kurz auf die Anfrage eingehen / den Nutzen in EINEM Satz / Hinweis, dass das vollständige Angebot ${params.pdf_link ? 'verlinkt ist' : 'beiliegt'} / Einladung zum nächsten Schritt / Gruß.
GRENZE: KEINE Detailpreise im Text.`;
      } else {
        if (positionen.length === 0) {
          return Response.json(
            { error: 'Das Angebot enthält keine freigegebenen Positionen — bitte zuerst im Angebots-Studio fertigstellen.' },
            { status: 400 },
          );
        }
        task = `AUFGABE: Die E-Mail trägt das Angebot "${angebot.titel || ''}" selbst.
AUFBAU: Bezug (1 Satz) / "Leistungen:" — je Position "Leistung - Ergebnis - Preis netto", höchstens zwei Zeilen je Position / "Nicht enthalten:" 1-3 Zeilen / "Summe:" netto, 20 % USt., brutto / Gültigkeit, exakt der Satz "Dieses Angebot gilt bis ${angebot.gueltig_bis || ''}." / EIN Satz Verweis auf die AGB / EIN konkreter nächster Schritt / Gruß.
GRENZE: ausschließlich diese Positionen und Preise. Keine Position ergänzen, keinen Preis runden, keinen Rabatt.
FREIGEGEBENE POSITIONEN (einzige Quelle):
${JSON.stringify({ positionen, summe_netto: angebot.summe_netto, nicht_enthalten: angebot.nicht_enthalten || [] }, null, 2)}`;
      }
    } else if (intent === 'nachfassen') {
      task = `AUFGABE: Freundlich nachfassen zum Angebot "${angebot.titel || ''}"${angebot.gesendet_am ? `, übermittelt am ${angebot.gesendet_am}` : ''}${params.tage_seit_versand ? ` (vor ${params.tage_seit_versand} Tagen)` : ''}.
AUFBAU: Anrede / Bezug auf das Angebot mit Datum / Nachfrage nach dem Stand, ausdrücklich ohne Druck / Angebot, offene Fragen in einem kurzen Gespräch zu klären / EIN Satz, der ein "derzeit nicht die Priorität" ausdrücklich zulässt / Gruß.
GRENZE: keine Preisänderung, kein Rabatt, keine Frist, keine zweite Erinnerung im selben Text. Die Tagesanzahl wird genannt, nicht vorgeworfen.
${params.schwerpunkt ? `SCHWERPUNKT: ${params.schwerpunkt}` : ''}`;
    } else if (intent === 'angebot_nachfrage') {
      task = `AUFGABE: Persönlich beim Kunden nachfragen, wie es um das übermittelte Angebot "${angebot.titel || ''}" steht${angebot.gesendet_am ? `, übermittelt am ${angebot.gesendet_am}` : ''}${params.tage_seit_versand ? ` (vor ${params.tage_seit_versand} Tagen)` : ''}.
AUFBAU: Anrede mit Namen / EIN Satz, der das ursprüngliche Anliegen aus dem belegten Text WÖRTLICH aufgreift (konkretes Vorhaben, keine allgemeine Formel) / Bezug auf das Angebot mit Datum / die eigentliche Nachfrage: ob das Angebot passt, was noch fehlt, wo es Fragen gibt${params.ergaenzung ? ' / die Ergänzung inhaltlich eingearbeitet' : ''} / Angebot, offene Punkte in einem kurzen Gespräch zu klären / Gruß.
GRENZE: keine Preisänderung, kein Rabatt, keine Frist, kein Druck, keine Mahnsprache. Nichts erfinden, was nicht im belegten Text steht.
UNVERWECHSELBARKEIT: Der Text darf nicht wie ein Serienbrief klingen. Mindestens eine Formulierung stammt erkennbar aus dem konkreten Vorhaben des Kunden. Keine Floskeln wie "wir wollten nur kurz nachfragen".
${params.persoenlich ? `PERSÖNLICHER BEZUG (natürlich einbauen, nicht anhängen): ${params.persoenlich}` : ''}
${params.ergaenzung ? `ERGÄNZUNG DER PERSON (inhaltlich einarbeiten): ${params.ergaenzung}` : ''}`;
    } else if (intent === 'rueckfrage') {
      const punkte = (params.punkte || []).map((p: string) => String(p || '').trim()).filter(Boolean);
      if (punkte.length === 0) return Response.json({ error: 'Mindestens ein offener Punkt nötig.' }, { status: 400 });
      task = `AUFGABE: Offene Punkte erfragen.
AUFBAU: Anrede / Dank / EIN Satz, warum es diese Angaben für eine belastbare Aussage braucht / die Punkte als Aufzählung, je Punkt eine Zeile "- <Punkt>" / Angebot, das auch telefonisch zu klären / Gruß.
GRENZE: nur diese Punkte, keine zusätzlichen Fragen.
DIE PUNKTE:
${punkte.map((p) => `- ${p}`).join('\n')}`;
    } else if (intent === 'absage') {
      const grund = String(params.grund || '').trim();
      if (!grund) return Response.json({ error: 'Ohne Grund keine Absage.' }, { status: 400 });
      task = `AUFGABE: Die Anfrage absagen.
AUFBAU: Anrede / Dank für die Anfrage und das Vertrauen / die Absage klar im ersten Drittel, mit dem sachlichen Grund / optional ein Hinweis auf einen späteren Zeitpunkt / Gruß.
GRENZE: keine Schuldzuweisung, keine Kritik am Kunden, kein Bedauern über mehrere Sätze. Der Grund wird höflich formuliert, aber nicht verschleiert.
DER GRUND: ${grund}`;
    }

    const preisFrei = intent === 'angebot';
    const signatur = user.full_name || 'Rittler & Co';

    const prompt = `Du schreibst als ${signatur} von der Digitalagentur Rittler & Co (Österreich) eine E-Mail an ${senderName || deal?.contact_name || 'den Kunden'}${deal?.company_name ? ` von ${deal.company_name}` : ''}.

TONALITÄT (gilt immer):
- Deutsch, per Sie. Herzlich und wertschätzend, aber knapp.
- Keine Werbesprache, keine Superlative, keine Floskeln ("Bezug nehmend auf", "hiermit").
- Der erste inhaltliche Absatz greift das KONKRETE Anliegen in eigenen Worten auf — ein Satz, der zeigt, dass gelesen wurde.
- Kein Absatz länger als drei Zeilen. Reiner Fließtext: kein Markdown, keine Sternchen, keine Rauten, keine Trennlinien, keine Emojis.
- Aufzählungen ausschließlich mit "- " am Zeilenanfang.
- Absätze werden mit echten Zeilenumbrüchen getrennt: zwischen zwei Absätzen genau eine Leerzeile, Anrede und Grußzeilen je auf eigener Zeile. Niemals alles in einer einzigen Zeile.
${preisFrei ? '' : '- VERBOTEN: Preise, Aufwandsschätzungen, Liefertermine, Rabatte, Zusagen zu Leistungen.\n'}- VERBOTEN: erfundene Termine, erfundene Personen, Platzhalter wie [Name].
- Schluss immer drei eigene Zeilen: "Beste Grüße" / ${signatur} / "Rittler & Co".

${task}

ZWEI VARIANTEN, gleicher Inhalt, unterschiedliche Länge und Haltung:
- variant_a: kompakt und direkt, ca. 90-130 Wörter
- variant_b: ausführlicher und beratend, ca. 170-230 Wörter
Beide sagen dasselbe zu und nennen dieselben Termine, Preise und Punkte.
${feedback ? `
ÜBERARBEITUNG — verbindlicher Änderungswunsch: "${feedback}"
Formulierung, Ton und Betonung ändern sich. Die harten Angaben (Termine, Preise, Positionen) bleiben unverändert.
BISHERIGE VARIANTE A:
"""
${previous_a}
"""
BISHERIGE VARIANTE B:
"""
${previous_b}
"""` : ''}

BETREFF DES VERLAUFS: ${subject || '—'}

BELEGTER TEXT (einzige inhaltliche Quelle):
"""
${conversation}
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

    return Response.json({
      subject: String(res.subject || '').replace(/[*#`]/g, '').trim() || (subject ? `Re: ${subject}` : 'Ihre Anfrage'),
      variant_a: cleanText(res.variant_a),
      variant_b: cleanText(res.variant_b),
      recipient: senderMail,
      thread_subject: subject,
      source,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}