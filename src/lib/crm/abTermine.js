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

// Weicht der Sprint von der AB ab? Verglichen wird nur, was in der AB tatsächlich steht.
export function terminAbweichung(sprint, auftrag) {
  const ab = abTermine(auftrag);
  const start = Boolean(ab.start && sprint?.start_date && ab.start !== sprint.start_date);
  const lieferung = Boolean(ab.lieferung && sprint?.delivery_date && ab.lieferung !== sprint.delivery_date);
  return { ab, start, lieferung, abweichend: start || lieferung };
}
