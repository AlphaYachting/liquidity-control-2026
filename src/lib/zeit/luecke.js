// Ohne angegebenes Zeitfenster wird die Buchung in die erste Lücke des Tages
// gelegt, die lang genug ist — sonst an das Ende der letzten Buchung.
const TAGESBEGINN = 9 * 60;
const TAGESENDE = 19 * 60;

const isoVon = (tag, minute) => {
  const [y, m, d] = tag.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(minute / 60), minute % 60, 0).toISOString();
};

const minuteVon = (iso) => {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
};

// eintraege = TimeEntries derselben Person am selben Tag
export function findeLuecke(tag, eintraege, minuten) {
  const belegt = eintraege
    .filter((e) => e.started_at && e.ended_at)
    .map((e) => ({ von: minuteVon(e.started_at), bis: minuteVon(e.ended_at) }))
    .sort((a, b) => a.von - b.von);

  let cursor = TAGESBEGINN;
  for (const b of belegt) {
    if (b.von - cursor >= minuten) break;
    cursor = Math.max(cursor, b.bis);
  }
  if (cursor + minuten > TAGESENDE && belegt.length) {
    cursor = Math.max(...belegt.map((b) => b.bis));
  }
  return { started_at: isoVon(tag, cursor), ended_at: isoVon(tag, cursor + minuten) };
}

export function fensterZuIso(tag, fenster) {
  return { started_at: isoVon(tag, fenster.vonMinute), ended_at: isoVon(tag, fenster.bisMinute) };
}