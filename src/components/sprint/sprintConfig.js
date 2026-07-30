// Zentrale Konfiguration des Sprint-Moduls (Design-System Rittler & Co)
export const RITTLER = {
  pink: '#ff3764',
  green: '#45d085',
  black: '#2d2d2d',
  grayLight: '#f5f5f5',
  grayMid: '#999999',
  yellow: '#f5a623',
};

export const MILESTONE_STATES = ['input', 'produktion', 'pruefung', 'kundenfeedback', 'freigegeben'];

export const STATE_LABELS_SHORT = {
  input: 'Input',
  produktion: 'Prod.',
  pruefung: 'Prüf.',
  kundenfeedback: 'Feedb.',
  freigegeben: 'Frei',
};

export const STATE_LABELS = {
  input: 'Input',
  produktion: 'Produktion',
  pruefung: 'Interne Prüfung',
  kundenfeedback: 'Kundenfeedback',
  freigegeben: 'Freigegeben',
};

export const SPRINT_SIZES = {
  S: { label: 'S', weeks: 2, subtitle: '2 Wochen' },
  M: { label: 'M', weeks: 4, subtitle: '4 Wochen' },
  L: { label: 'L', weeks: 8, subtitle: '8 Wochen' },
};

export const TICKET_STATUSES = ['offen', 'in_arbeit', 'wartet', 'erledigt'];
export const TICKET_STATUS_LABELS = {
  offen: 'Offen',
  in_arbeit: 'In Arbeit',
  wartet: 'Wartet',
  erledigt: 'Erledigt',
};

export const ROLES = ['Beratung', 'Konzept', 'Text', 'Grafik', 'Web', 'Media', 'QS'];

export const fmtEUR = (v) =>
  new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const addWeeks = (isoDate, weeks) => {
  const d = new Date(isoDate);
  d.setDate(d.getDate() + weeks * 7);
  return d.toISOString().slice(0, 10);
};