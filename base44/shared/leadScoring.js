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

// Art des Anliegens — von der KI mit wörtlichem Textbeleg geliefert.
export const REQUEST_NATURES = ['stoerung', 'aenderung_bestehend', 'neue_leistung', 'sonstiges'];

export const SUGGESTED_ACTIONS = ['supportticket', 'anfrage', 'kein_lead'];

const LEAD_TYPES = ['angebotsanfrage', 'erweiterung_bestandskunde'];

/**
 * Vorschlag für die menschliche Entscheidung — reines Etikett, KEIN Filter.
 * Jede Geschäftsmail bleibt unabhängig davon in der E-Mail-Zentrale sichtbar.
 */
export function suggestAction({ is_known_customer = false, request_nature = 'sonstiges', inquiry_type = '', signals = [] } = {}) {
  if (is_known_customer && ['stoerung', 'aenderung_bestehend'].includes(request_nature)) return 'supportticket';
  if (request_nature === 'neue_leistung') return 'anfrage';
  const konkret = LEAD_TYPES.includes(inquiry_type)
    && (signals.includes('konkreter_gegenstand') || signals.includes('beschaffungsabsicht'));
  if (!is_known_customer && konkret) return 'anfrage';
  return 'kein_lead';
}

// Eigener Track: Support-/Störungsmeldungen gehören in den Posteingang, sind aber kein Lead.
export const SUPPORT_TYPES = ['support_stoerung'];

/**
 * Ergebnis: { kind: 'lead' | 'support' | null, strength: 'stark' | 'schwach' | null, signals: string[], count: number }
 * kind null = kein Posteingangs-Eintrag, nur Ledger.
 */
export function scoreLead({ inquiryType, signals = [], isFormMail = false }) {
  const clean = [...new Set(signals.filter((s) => BUYING_SIGNALS.includes(s)))];
  const count = clean.length;
  const base = { signals: clean, count };
  if (isFormMail) return { kind: 'lead', strength: 'stark', ...base };
  if (SUPPORT_TYPES.includes(inquiryType)) return { kind: 'support', strength: null, ...base };
  if (!LEAD_TYPES.includes(inquiryType)) return { kind: null, strength: null, ...base };
  const hasCore = clean.includes('konkreter_gegenstand') || clean.includes('beschaffungsabsicht');
  if (count >= 3 && hasCore) return { kind: 'lead', strength: 'stark', ...base };
  if (count === 2) return { kind: 'lead', strength: 'schwach', ...base };
  return { kind: null, strength: null, ...base };
}