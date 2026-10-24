import { base44 } from '@/api/base44Client';
import { alsDatum } from '@/lib/zeitpunkt';

// „Was ist neu" — Ausgaben, die nach einem Update einmal je Person beim Öffnen der App erscheinen.
// Neuigkeit = die Ausgabe (Entwurf → veröffentlicht, nur Admins schreiben).
// NeuigkeitGelesen = je Person und Ausgabe ein Datensatz, sobald „Verstanden" gedrückt wurde.

export const ZIELGRUPPEN = [
  { value: 'alle', label: 'Alle' },
  { value: 'leitung', label: 'Projektleitung und Führung' },
  { value: 'support', label: 'Webentwicklung und Führung' },
  { value: 'fuehrung', label: 'Führung' },
  { value: 'geld', label: 'Finanzrecht (Backoffice, Führung)' },
];
export const ZIELGRUPPE_LABEL = Object.fromEntries(ZIELGRUPPEN.map((z) => [z.value, z.label]));

export const VEROEFFENTLICHT_KEY = ['neuigkeiten-veroeffentlicht'];
export const GELESEN_KEY = (email) => ['neuigkeiten-gelesen', email];
export const ALLE_KEY = ['neuigkeiten-alle'];

export const ladeVeroeffentlichte = () =>
  base44.entities.Neuigkeit.filter({ status: 'veroeffentlicht' }, '-veroeffentlicht_am', 30);

export const ladeGelesene = (email) =>
  base44.entities.NeuigkeitGelesen.filter({ person_email: email }, '-gelesen_am', 200);

export const ladeAlle = () => base44.entities.Neuigkeit.list('-created_date', 100);

// Sichtbar für die Person? Zielgruppe = Recht aus useZugriff
export const sichtbar = (n, zugriff) => zugriff.darf(n.zielgruppe || 'alle');

// Ungelesene, für die Person sichtbare Ausgaben, neueste zuerst — höchstens drei auf einmal
export function ungelesen(ausgaben = [], gelesene = [], zugriff) {
  const ids = new Set(gelesene.map((g) => g.neuigkeit_id));
  return ausgaben.filter((n) => !ids.has(n.id) && sichtbar(n, zugriff)).slice(0, 3);
}

export async function alsGelesenMarkieren(ausgaben, email) {
  const jetzt = new Date().toISOString();
  await Promise.all(
    ausgaben.map((n) => base44.entities.NeuigkeitGelesen.create({ neuigkeit_id: n.id, person_email: email, gelesen_am: jetzt })),
  );
}

export const tag = (d) => (d ? alsDatum(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

// Punkte als Textzeilen: „Text — Wunsch von Name" ↔ { text, von }
export function punkteAusText(text) {
  return (text || '')
    .split('\n')
    .map((z) => z.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .map((z) => {
      const m = z.match(/^(.*?)\s*[—–-]\s*(?:Wunsch|Rückmeldung|Hinweis) von\s+(.+)$/i);
      return m ? { text: m[1].trim(), von: m[2].trim() } : { text: z, von: '' };
    });
}
export const punkteAlsText = (punkte = []) =>
  punkte.map((p) => (p.von ? `${p.text} — Wunsch von ${p.von}` : p.text)).join('\n');
