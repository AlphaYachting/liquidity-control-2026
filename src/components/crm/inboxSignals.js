// Anzeigetexte der Einstufung im CRM-Posteingang.

export const SIGNAL_LABELS = {
  konkreter_gegenstand: 'Konkreter Gegenstand',
  beschaffungsabsicht: 'Beschaffungsabsicht',
  zeit_oder_budgetrahmen: 'Zeit-/Budgetrahmen',
  absender_zurechenbar: 'Absender zurechenbar',
  erreichbarkeit: 'Erreichbarkeit',
};

export const INQUIRY_TYPE_LABELS = {
  angebotsanfrage: 'Angebotsanfrage',
  erweiterung_bestandskunde: 'Erweiterung Bestandskunde',
  laufende_projektkommunikation: 'Laufende Projektkommunikation',
  support_stoerung: 'Support / Störung',
  verwaltung: 'Verwaltung',
  kein_geschaeft: 'Kein Geschäft',
};

export const STRENGTH_META = {
  stark: { label: 'Lead-Verdacht stark', color: 'bg-emerald-100 text-emerald-700' },
  schwach: { label: 'Lead-Verdacht schwach', color: 'bg-amber-100 text-amber-700' },
};

// "konkreter_gegenstand — 'neue Website'" -> { label, evidence }
export const parseSignal = (raw) => {
  const [key, ...rest] = String(raw || '').split('—');
  const k = key.trim();
  return { label: SIGNAL_LABELS[k] || k, evidence: rest.join('—').trim() };
};

export const DISMISS_REASONS = ['Werbung', 'Bewerbung', 'kein Bedarf', 'Sonstiges'];