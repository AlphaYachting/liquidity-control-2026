import { todayIso } from '@/components/sprint/sprintConfig';
import { workdaysUntil } from '@/lib/sprint/status';
import { fensterEnde, istUeberfaellig } from '@/lib/sprint/faelligkeit';
import { laufenderMonat, stundenVon, imMonat, nachFaelligkeit } from '@/lib/sprint/behaelterZahlen';

const dayDiff = (iso, from) => Math.ceil((new Date(iso) - new Date(from)) / 86400000);

// Status für Container, Support, Regie, Intern und Altprojekte — gleiche Form wie sprintStatus
// (ampel, ampelGrund, urgency), Inhalte aus Aufgaben und Monatsstunden statt Etappen.
export function behaelterStatus({ project, tickets = [], timeEntries = [], contract }) {
  const today = todayIso();
  const monat = laufenderMonat();
  const offen = tickets.filter((t) => t.status !== 'erledigt').sort(nachFaelligkeit);
  const ueberfaellig = offen.filter((t) => istUeberfaellig(t, today));
  const naechste = ueberfaellig[0] || offen.find((t) => t.planned_for) || null;
  const naechsteTage = naechste ? dayDiff(fensterEnde(naechste), today) : null;
  const naechsteArbeitstage = naechste ? workdaysUntil(fensterEnde(naechste), today) : null;

  // Fortschritt: nur Aufgaben mit Fälligkeit im laufenden Monat
  const imMonatFaellig = tickets.filter((t) => (t.planned_for || '').startsWith(monat));
  const monatErledigt = imMonatFaellig.filter((t) => t.status === 'erledigt').length;

  const monatsBuchungen = imMonat(timeEntries, monat);
  const stunden = monatsBuchungen.reduce((s, e) => s + stundenVon(e), 0);
  const verrechenbar = monatsBuchungen.filter((e) => e.verrechenbar !== false).reduce((s, e) => s + stundenVon(e), 0);

  let ampel = 'plan';
  let ampelGrund = 'Alles im Plan.';
  let urgency = 5;
  if (ueberfaellig.length) {
    ampel = 'action';
    urgency = 1;
    ampelGrund = `${ueberfaellig.length} ${ueberfaellig.length === 1 ? 'Aufgabe' : 'Aufgaben'} überfällig.`;
  } else if (naechste && naechsteArbeitstage <= 3) {
    ampel = 'attention';
    urgency = 2;
    ampelGrund = `„${naechste.title}" ist in ${naechsteTage} Tagen fällig.`;
  } else if (naechste && naechsteArbeitstage <= 7) {
    urgency = 4;
  }

  return {
    ampel,
    ampelGrund,
    urgency,
    naechste,
    naechsteTage,
    weitereUeberfaellig: Math.max(0, ueberfaellig.length - 1),
    monatErledigt,
    monatGesamt: imMonatFaellig.length,
    stunden,
    verrechenbar,
    kontingent: project?.support_kontingent_stunden || 0,
    pauschale: contract?.monthly_fixed_price || 0,
    stundensatz: project?.stundensatz || 0,
  };
}