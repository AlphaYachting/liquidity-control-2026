// Formatierung für Sanierungs-Reporting — immer 2 Nachkommastellen, Tausendertrennung, EUR.
export const fmtEUR = (value) =>
  new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

export const fmtNum = (value, decimals = 2) =>
  new Intl.NumberFormat('de-AT', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value) || 0);

export const fmtPct = (value) => `${(Number(value) || 0).toFixed(1)}%`;

export const fmtDate = (d) => {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return new Intl.DateTimeFormat('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
};

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const MONTH_NAMES_DE = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const monthLabel = (key) => {
  if (!key) return '—';
  const [y, m] = key.split('-');
  return `${MONTH_NAMES_DE[parseInt(m, 10) - 1] || m} ${y}`;
};

export const OUTFLOW_CATEGORY_LABELS = {
  personal: 'Personal',
  miete: 'Miete',
  tools_saas: 'Tools / SaaS',
  steuern_sva: 'Steuern / SVA',
  lieferanten: 'Lieferanten',
  sonstiges: 'Sonstiges',
};