import { base44 } from '@/api/base44Client';
import { queryClientInstance } from '@/lib/query-client';

// Zeitstempel „Tool geöffnet“: der erste Aufruf der App je Person und Kalendertag.
// Er ist NICHT der Arbeitsbeginn, sondern der früheste belegte Moment des Tages.
// Ab ihm beginnen im Tagesstreifen die Lücken und Buchungen ohne Zeitfenster.
// Vorstufe zu Kommen/Gehen (Ausbaustufe 2) — die Felder dafür stehen schon an der Entität.

const zwei = (n) => String(n).padStart(2, '0');
export const heuteIso = (d = new Date()) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
export const minuteAus = (iso) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };

// Mehrere Datensätze am selben Tag (zwei Tabs gleichzeitig) sind möglich — es zählt der früheste.
export function fruehesterAufruf(rows = []) {
  return rows.map((r) => r.erster_aufruf_am).filter(Boolean).sort()[0] || null;
}

// Je Tag der früheste Aufruf als Minute des Tages: { 'YYYY-MM-DD': minute }
export function beginnJeTag(rows = []) {
  const frueh = {};
  rows.forEach((r) => {
    if (!r.tag || !r.erster_aufruf_am) return;
    if (!frueh[r.tag] || r.erster_aufruf_am < frueh[r.tag]) frueh[r.tag] = r.erster_aufruf_am;
  });
  return Object.fromEntries(Object.entries(frueh).map(([t, iso]) => [t, minuteAus(iso)]));
}

export const ladeArbeitstage = (email, von, bis) => queryClientInstance.fetchQuery({
  queryKey: ['arbeitstage', email, von, bis],
  staleTime: 60 * 1000,
  queryFn: () => base44.entities.Arbeitstag
    .filter({ person_email: email, tag: { $gte: von, $lte: bis } }, 'tag', 50)
    .catch(() => []),
});

// Tagesbeginn (Minute) für einen Tag, oder null, wenn es keinen Zeitstempel gibt.
export async function tagesbeginnMinute(email, tag) {
  if (!email || !tag) return null;
  const rows = await ladeArbeitstage(email, tag, tag);
  return beginnJeTag(rows)[tag] ?? null;
}

// Einmal je Tag schreiben. localStorage spart die Abfrage bei jedem weiteren Öffnen;
// ein laufender Versuch je Tag wird geteilt (StrictMode, mehrere Auslöser).
const laufend = {};
export function stempleErstenAufruf(email) {
  if (!email) return Promise.resolve();
  const tag = heuteIso();
  const schluessel = `arbeitstag:${email}:${tag}`;
  try { if (localStorage.getItem(schluessel)) return Promise.resolve(); } catch { /* ohne Speicher weiter */ }
  if (laufend[schluessel]) return laufend[schluessel];
  laufend[schluessel] = (async () => {
    try {
      const rows = await base44.entities.Arbeitstag.filter({ person_email: email, tag }, 'erster_aufruf_am', 5);
      if (!rows.length) {
        await base44.entities.Arbeitstag.create({ person_email: email, tag, erster_aufruf_am: new Date().toISOString(), quelle: 'app' });
        queryClientInstance.invalidateQueries({ queryKey: ['arbeitstage', email] });
        queryClientInstance.invalidateQueries({ queryKey: ['zeitenSeite', email] });
      }
      try { localStorage.setItem(schluessel, '1'); } catch { /* egal */ }
    } catch {
      // Das Öffnen der App hängt nie an diesem Stempel — beim nächsten Fokus neuer Versuch.
    } finally {
      delete laufend[schluessel];
    }
  })();
  return laufend[schluessel];
}
