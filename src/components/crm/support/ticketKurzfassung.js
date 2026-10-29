import { base44 } from '@/api/base44Client';
import { unwrapLLM } from '@/components/crm/proposals/jsonFields';

// KI-Kurzfassung einer Kunden-E-Mail für den Techniker (29.10.2026):
// Wer das Ticket öffnet, sieht zuerst, WAS zu tun ist — der E-Mail-Verlauf steht darunter.
// Mehrere Probleme werden einzelne To-dos (Ticket-Checkliste). Vorschlag, im Dialog editierbar.

const MAX_QUELLE = 12000;

export async function kiKurzfassung({ text, betreff = '', kunde = '' }) {
  const quelle = String(text || '').trim().slice(-MAX_QUELLE);
  if (!quelle) throw new Error('kein Text');
  const res = await base44.integrations.Core.InvokeLLM({
    prompt: `Du bereitest Support-Anfragen für die Techniker der Webagentur Rittler & Co auf.
Kunde: ${kunde || '—'}
Betreff: ${betreff || '—'}

E-Mail-Verlauf (älteste zuerst; die jüngsten Kundennachrichten sind maßgeblich):
"""${quelle}"""

Fasse für den Techniker zusammen, was der Kunde will — sachlich, knapp, auf Deutsch.
Regeln:
- Erfinde nichts. Was nicht in der E-Mail steht, lässt du weg. Keine Lösungsvorschläge, keine Vermutungen.
- anliegen: worum es geht, 1–2 kurze Sätze.
- betroffen: betroffene Website, Domain, Seite, Shop, Formular, Postfach o. Ä. — nur wenn genannt, sonst leer.
- aufgaben: jedes eigenständige Problem bzw. jeder Änderungswunsch als eigener Punkt, als kurze Handlungsanweisung (max. ca. 12 Wörter, mit konkreter Stelle/URL wenn genannt). Gleiche Sache nur einmal. Bereits erledigte oder zurückgezogene Punkte weglassen.
- hinweise: Frist oder Termin des Kunden, Ansprechperson, ob Zugangsdaten oder Anhänge in der E-Mail erwähnt sind — nur wenn vorhanden, sonst leer.
- Zugangsdaten, Passwörter, Benutzernamen, IBAN und ähnliche Geheimnisse NIE abschreiben; nur vermerken „Zugangsdaten stehen in der E-Mail“.
- Grußformeln, Signaturen, Disclaimer und Höflichkeiten ignorieren.`,
    response_json_schema: {
      type: 'object',
      properties: {
        anliegen: { type: 'string' },
        betroffen: { type: 'string' },
        aufgaben: { type: 'array', items: { type: 'string' } },
        hinweise: { type: 'string' },
      },
      required: ['anliegen', 'aufgaben'],
    },
  });
  const r = unwrapLLM(res);
  if (!r || typeof r !== 'object' || !String(r.anliegen || '').trim()) throw new Error('kein Vorschlag');
  const sauber = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const aufgaben = [...new Set((Array.isArray(r.aufgaben) ? r.aufgaben : []).map(sauber).filter(Boolean))].slice(0, 15);
  return {
    anliegen: sauber(r.anliegen),
    betroffen: sauber(r.betroffen),
    aufgaben,
    hinweise: sauber(r.hinweise),
  };
}

// Strukturierter Text für die Ticket-Beschreibung. Bei mehreren Aufgaben stehen sie als
// Checkliste im Ticket — im Text nur der Verweis, damit nichts doppelt gepflegt wird.
export function kurzfassungAlsText(k) {
  if (!k) return '';
  const zeilen = [`Anliegen: ${k.anliegen}`];
  if (k.betroffen) zeilen.push(`Betroffen: ${k.betroffen}`);
  if (k.aufgaben.length === 1) zeilen.push(`Zu tun: ${k.aufgaben[0]}`);
  if (k.aufgaben.length > 1) zeilen.push('Zu tun: mehrere Punkte — siehe Checkliste');
  if (k.hinweise) zeilen.push(`Hinweise: ${k.hinweise}`);
  return zeilen.join('\n');
}

// Mehrere Probleme → To-do-Liste im Ticket; ein einzelnes steht schon im Text
export const kurzfassungAlsCheckliste = (k) => (k && k.aufgaben.length > 1
  ? k.aufgaben.map((text) => ({ text, done: false }))
  : []);
