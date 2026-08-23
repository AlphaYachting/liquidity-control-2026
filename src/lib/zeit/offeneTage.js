// Die Regel für offene Arbeitstage — sie sperrt neue Buchungen, nie die Messung.
import { werteTagAus, verschiebeTage } from './tagesAuswertung';

export const MAX_LUECKE = 45;
export const RUECKBLICK_TAGE = 14;
// Solange die Demophase läuft, gilt kein Tag vor dem Systemstart als offen.
export const SYSTEMSTART = '2026-08-24';

export const istWerktag = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  const wt = new Date(y, m - 1, d).getDay();
  return wt >= 1 && wt <= 5;
};

// Die vergangenen Werktage vor heute, ältester zuerst.
export const vergangeneWerktage = (heute, anzahl = RUECKBLICK_TAGE) =>
  Array.from({ length: anzahl }, (_, i) => verschiebeTage(heute, -(anzahl - i)))
    .filter(istWerktag);

// Ein Tag ist abschließbar, wenn eine Buchung vorliegt und keine Lücke über 45 Minuten bleibt.
export const abschliessbar = (auswertung) =>
  auswertung.anzahl > 0 && !auswertung.loecher.some((l) => l.minuten > MAX_LUECKE);

export const istAbwesend = (focusDays, tag) =>
  focusDays.some((f) => f.type === 'abwesend' && f.day <= tag && (f.until || f.day) >= tag);

// Offen = vergangener Werktag, keine Abwesenheit, kein bestätigter Tagesabschluss.
export function ermittleOffeneTage({ heute, eintraege = [], abschluesse = [], focusDays = [] }) {
  return vergangeneWerktage(heute)
    .filter((tag) => tag >= SYSTEMSTART)
    .filter((tag) => !istAbwesend(focusDays, tag))
    .filter((tag) => !abschluesse.some((a) => a.tag === tag && a.bestaetigt_am))
    .map((tag) => {
      const auswertung = werteTagAus({
        tag,
        eintraege: eintraege.filter((e) => e.entry_date === tag),
        pausen: abschluesse.find((a) => a.tag === tag)?.pausen || [],
      });
      return { tag, offenMinuten: auswertung.offenMinuten, gebuchtMinuten: auswertung.gebuchtMinuten };
    });
}