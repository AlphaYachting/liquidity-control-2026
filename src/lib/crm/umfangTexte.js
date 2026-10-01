import { STANDARD_MEHRKOSTEN } from '@/lib/crm/angebotsUmfang';

// Texte aus dem freigegebenen Umfang — für sevDesk-Belege und den Projekt-Startkeim
const fmt = (d) => (d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const schleifen = (p, a) => {
  const n = p.korrekturschleifen !== '' && p.korrekturschleifen != null ? p.korrekturschleifen : a.korrekturschleifen;
  return n !== '' && n != null ? Number(n) : null;
};

export function positionsText(p, a) {
  const teile = [p.description || ''];
  if (p.lieferumfang?.length) teile.push('', 'Leistungsumfang:', ...p.lieferumfang.map((l) => `• ${l}`));
  const n = schleifen(p, a);
  if (n != null) teile.push(`Inkludiert: ${n} Korrekturschleifen`);
  if (p.leistungszeitraum) teile.push(`Zeitraum: ${p.leistungszeitraum}`);
  return teile.join('\n').trim();
}

export function abKopfText(a) {
  let satz = 'Vielen Dank für Ihren Auftrag. Wir bestätigen die folgenden Leistungen gemäß unserem Angebot';
  if (a.angebot_nummer) satz += ` Nr. ${a.angebot_nummer}`;
  if (a.angebot_datum) satz += ` vom ${fmt(a.angebot_datum)}`;
  const teile = [`${satz}.`];
  if (a.leistungszeitraum) teile.push('', `Leistungszeitraum: ${a.leistungszeitraum}`);
  if (a.liefertermin) teile.push(`Liefertermin: ${fmt(a.liefertermin)}`);
  if (a.nicht_enthalten?.length) teile.push('', 'Nicht Bestandteil dieses Auftrags:', ...a.nicht_enthalten.map((x) => `• ${x}`));
  if (a.mehrkosten_regel && a.mehrkosten_regel !== STANDARD_MEHRKOSTEN) teile.push('', a.mehrkosten_regel);
  return teile.join('\n');
}

export function umfangText(positions, a) {
  const z = positions.map((p) => {
    const n = schleifen(p, a);
    return `• ${p.name}: ${p.description || ''}${n != null ? ` (${n} Korrekturschleifen)` : ''}`;
  });
  if (a.leistungszeitraum) z.push('', `Leistungszeitraum: ${a.leistungszeitraum}`);
  if (a.liefertermin) z.push(`Liefertermin: ${fmt(a.liefertermin)}`);
  if (a.nicht_enthalten?.length) z.push(`Nicht enthalten: ${a.nicht_enthalten.join(', ')}`);
  if (a.mehrkosten_regel) z.push(`Mehrkostenregel: ${a.mehrkosten_regel}`);
  if (a.angebot_url) z.push(`Angebot: ${a.angebot_url}`);
  return z.join('\n');
}

export const kundenAdresse = (c) => [c?.name, c?.contact_person, c?.street, [c?.zip, c?.city].filter(Boolean).join(' ')]
  .filter(Boolean).join('\n');

// Angehakte Positionen identisch mit dem E-Mail-Angebot (Name und Betrag)?
export function gleichWieAngebot(positions, quote) {
  const a = (quote?.items || []).map((i) => `${(i.title || '').trim()}|${Number(i.total_price) || 0}`).sort();
  const b = positions.map((p) => `${p.name.trim()}|${Number(p.amount) || 0}`).sort();
  return a.length > 0 && a.length === b.length && a.every((x, i) => x === b[i]);
}