// Termine, wie sie in der Auftragsbestätigung stehen: Kick-off aus dem
// Leistungszeitraum (Freitext), Liefertermin aus dem Auftragsfeld.
const ausText = (t) => {
  const m = String(t || '').match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};
const alsIso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : ausText(v));

export function abTermine(auftrag) {
  if (!auftrag) return { start: '', lieferung: '' };
  const kick = String(auftrag.leistungszeitraum || '')
    .match(/(?:kick[\s-]?off|projektstart|start|beginn)[^\d\n]{0,40}(\d{1,2}\.\d{1,2}\.\d{4})/i);
  return { start: kick ? ausText(kick[1]) : '', lieferung: alsIso(auftrag.liefertermin) };
}

// Sprintgröße aus der Spanne Kick-off bis Lieferung: bis 2 Wochen S, bis 4 Wochen M, darüber L.
// Ohne beide Termine kein Vorschlag — dann wählt die Person im Assistenten.
export function sprintGroesseAus({ start, lieferung }) {
  if (!start || !lieferung) return '';
  const tage = (new Date(`${lieferung}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000;
  if (!(tage > 0)) return '';
  return tage <= 14 ? 'S' : tage <= 28 ? 'M' : 'L';
}

// Weicht der Sprint von der AB ab? Verglichen wird nur, was in der AB tatsächlich steht.
export function terminAbweichung(sprint, auftrag) {
  const ab = abTermine(auftrag);
  const start = Boolean(ab.start && sprint?.start_date && ab.start !== sprint.start_date);
  const lieferung = Boolean(ab.lieferung && sprint?.delivery_date && ab.lieferung !== sprint.delivery_date);
  return { ab, start, lieferung, abweichend: start || lieferung };
}
