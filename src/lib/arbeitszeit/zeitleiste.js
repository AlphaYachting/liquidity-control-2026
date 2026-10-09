// Ein Tag als EINE Liste nach Uhrzeit: Gekommen, Arbeit begonnen …, Pause, Arbeit begonnen …, Gegangen.
// Anwesenheit (Stempel) und Projektarbeit (Buchungen) stehen gemischt, so wie der Tag war.
// Zeiten innerhalb der Anwesenheit ohne Projekt erscheinen als eigene, leise Zeile.
// Rein rechnend — Eingabe ist ein Tag aus der Funktion `arbeitszeit` (aktion: monat).

const LUECKE_AB_MIN = 5;
const ms = (iso) => Date.parse(iso);
const min = (von, bis) => Math.max(0, Math.round((ms(bis) - ms(von)) / 60000));

// Reihenfolge bei gleicher Uhrzeit
const RANG = { kommen: 0, alt: 0.5, pause_ende: 1, arbeit: 2, laeuft: 2, ohne: 3, pause: 4, gehen: 5 };

export function zeitleiste(tag, { jetztIso, timer = null } = {}) {
  const zeilen = [];
  const gueltig = tag.stempel.filter((s) => s.status === 'gueltig').sort((a, b) => a.zeit.localeCompare(b.zeit));

  // Anwesenheit: Kommen, Gehen, Pausen (Beginn + Ende in einer Zeile)
  let offenePause = null;
  for (const s of gueltig) {
    if (s.art === 'kommen') zeilen.push({ typ: 'kommen', zeit: s.zeit, stempel: s });
    else if (s.art === 'gehen') {
      if (offenePause) { zeilen.push({ typ: 'pause', zeit: offenePause.zeit, bis: s.zeit, start: offenePause }); offenePause = null; }
      zeilen.push({ typ: 'gehen', zeit: s.zeit, stempel: s, automatisch: s.quelle === 'auto' });
    } else if (s.art === 'pause_start') offenePause = s;
    else if (s.art === 'pause_ende') {
      zeilen.push({ typ: 'pause', zeit: offenePause ? offenePause.zeit : s.zeit, bis: s.zeit, start: offenePause, ende: s });
      offenePause = null;
    }
  }
  if (offenePause) zeilen.push({ typ: 'pause', zeit: offenePause.zeit, bis: null, start: offenePause, laeuft: true });

  // Ersetzte oder doppelte Stempel bleiben sichtbar, aber durchgestrichen
  tag.stempel.filter((s) => s.status !== 'gueltig').forEach((s) => zeilen.push({ typ: 'alt', zeit: s.zeit, stempel: s }));

  // Projektarbeit
  const mitZeit = tag.buchungen.filter((b) => b.started_at);
  mitZeit.forEach((b) => zeilen.push({ typ: 'arbeit', zeit: b.started_at, bis: b.ended_at, buchung: b }));
  if (timer && timer.gestartet_am) zeilen.push({ typ: 'laeuft', zeit: timer.gestartet_am, bis: null, timer });

  // Arbeitszeit ohne Projekt: Lücken innerhalb der Anwesenheit, die weder Projekt noch Pause sind
  (tag.bloecke || []).forEach((block) => {
    const ende = block.bis && block.bis > block.von ? block.bis : jetztIso;
    const belegt = [
      ...mitZeit.map((b) => [b.started_at, b.ended_at]),
      ...(tag.pausen || []).map((p) => [p.von, p.bis || jetztIso]),
      ...(timer?.gestartet_am ? [[timer.gestartet_am, jetztIso]] : []),
    ].filter(([v, b]) => v && b).sort((a, b) => a[0].localeCompare(b[0]));
    let zeiger = block.von;
    for (const [v, b] of belegt) {
      if (b <= zeiger) continue;
      if (v > zeiger && v <= ende && min(zeiger, v) >= LUECKE_AB_MIN) zeilen.push({ typ: 'ohne', zeit: zeiger, bis: v < ende ? v : ende });
      if (b > zeiger) zeiger = b;
      if (zeiger >= ende) break;
    }
    if (ende && zeiger < ende && min(zeiger, ende) >= LUECKE_AB_MIN) zeilen.push({ typ: 'ohne', zeit: zeiger, bis: ende, offen: !block.bis || block.bis === block.von });
  });

  zeilen.sort((a, b) => a.zeit.localeCompare(b.zeit) || (RANG[a.typ] ?? 9) - (RANG[b.typ] ?? 9));

  // Buchungen ohne Uhrzeit (Altbestand) ans Ende
  tag.buchungen.filter((b) => !b.started_at).forEach((b) => zeilen.push({ typ: 'arbeit', zeit: null, bis: null, buchung: b, ohneUhrzeit: true }));
  return zeilen.map((z) => ({ ...z, minuten: z.zeit && z.bis ? min(z.zeit, z.bis) : z.buchung ? z.buchung.duration_minutes : null }));
}
