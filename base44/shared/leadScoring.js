// Einstufung eingehender E-Mails in zwei Stufen: Anfragetyp (KI) und Kaufsignale (KI),
// die Schwellenregel selbst liegt hier im Code — nicht im Prompt.

export const INQUIRY_TYPES = [
  'angebotsanfrage',
  'erweiterung_bestandskunde',
  'laufende_projektkommunikation',
  'support_stoerung',
  'verwaltung',
  'kein_geschaeft',
];

export const BUYING_SIGNALS = [
  'konkreter_gegenstand',
  'beschaffungsabsicht',
  'zeit_oder_budgetrahmen',
  'absender_zurechenbar',
  'erreichbarkeit',
];

// Website-Formular-Mails: laufen über die eigene Adresse und sind der EINZIGE
// Weg, auf dem ein Lead automatisch entsteht.
export const FORM_REGEX =
  /hurra[\s\S]{0,15}die post ist da|sch(ö|oe)n von ihnen zu lesen|kontaktformular/i;

const LEAD_TYPES = ['angebotsanfrage', 'erweiterung_bestandskunde'];

/**
 * Ergebnis: { strength: 'stark' | 'schwach' | null, signals: string[], count: number }
 * strength null = kein Posteingangs-Eintrag, nur Ledger.
 */
export function scoreLead({ inquiryType, signals = [], isFormMail = false }) {
  const clean = [...new Set(signals.filter((s) => BUYING_SIGNALS.includes(s)))];
  const count = clean.length;
  if (isFormMail) return { strength: 'stark', signals: clean, count };
  if (!LEAD_TYPES.includes(inquiryType)) return { strength: null, signals: clean, count };
  const hasCore = clean.includes('konkreter_gegenstand') || clean.includes('beschaffungsabsicht');
  if (count >= 3 && hasCore) return { strength: 'stark', signals: clean, count };
  if (count === 2) return { strength: 'schwach', signals: clean, count };
  return { strength: null, signals: clean, count };
}