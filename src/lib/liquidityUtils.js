// Formatting helpers
export const formatCurrency = (value, opts = {}) => {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('de-AT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: opts.decimals ?? 0,
    maximumFractionDigits: opts.decimals ?? 0,
  }).format(num);
};

export const formatNumber = (value) => {
  return new Intl.NumberFormat('de-AT').format(Number(value) || 0);
};

export const formatPercent = (value) => `${(Number(value) || 0).toFixed(1)}%`;

// Month helpers — dynamisch: aktueller Monat + 11 Folgemonate
const _buildForecastMonths = () => {
  const now = new Date();
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
};

export const MONTHS_2026 = _buildForecastMonths(); // Name belassen für Abwärtskompatibilität

const DE_MONTH_NAMES = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export const getMonthLabel = (m) => {
  if (!m) return m;
  const [year, month] = m.split('-');
  const label = DE_MONTH_NAMES[parseInt(month, 10) - 1] || m;
  // Jahreszahl anhängen wenn nicht aktuelles Jahr
  const currentYear = new Date().getFullYear().toString();
  return year !== currentYear ? `${label} ${year.slice(2)}` : label;
};

// Für Abwärtskompatibilität
export const MONTH_LABELS = Object.fromEntries(MONTHS_2026.map(m => [m, getMonthLabel(m)]));

// Aggregation
export const aggregateByMonth = (lines, direction) => {
  const result = {};
  MONTHS_2026.forEach(m => { result[m] = 0; });
  lines.forEach(l => {
    if (direction && l.direction !== direction) return;
    if (l.month && result[l.month] !== undefined) {
      result[l.month] += Number(l.amount_net) || 0;
    }
  });
  return result;
};

export const aggregateByField = (items, field, valueField = 'amount_net') => {
  const result = {};
  items.forEach(item => {
    const key = item[field] || 'Sonstige';
    result[key] = (result[key] || 0) + (Number(item[valueField]) || 0);
  });
  return result;
};

// Overdue calculation
export const calcOverdueDays = (dueDate) => {
  if (!dueDate) return 0;
  const due = new Date(dueDate);
  const today = new Date();
  const diff = Math.floor((today - due) / (1000 * 60 * 60 * 24));
  return Math.max(0, diff);
};

export const getAgingBucket = (days) => {
  if (days <= 0) return 'not_due';
  if (days <= 30) return '1_30';
  if (days <= 60) return '31_60';
  if (days <= 90) return '61_90';
  return '90_plus';
};

export const AGING_LABELS = {
  'not_due': 'Nicht fällig',
  '1_30': '1–30 Tage',
  '31_60': '31–60 Tage',
  '61_90': '61–90 Tage',
  '90_plus': '90+ Tage'
};

// Status colors — Achse B des Sprint-Designs: erledigt / Aufmerksamkeit / kritisch / neutral
const DONE = 'bg-status-done-surface text-status-done-text border-status-done';
const ATTENTION = 'bg-status-attention-surface text-status-attention border-status-attention';
const CRITICAL = 'bg-status-critical-surface text-status-critical border-status-critical';
const NEUTRAL = 'bg-muted text-muted-foreground border-border';

export const STATUS_COLORS = {
  paid: DONE,
  invoiced: DONE,
  completed: DONE,
  active: DONE,
  planned: ATTENTION,
  pending: ATTENTION,
  uncertain: ATTENTION,
  unclear: ATTENTION,
  scheduled: ATTENTION,
  partially_paid: ATTENTION,
  deferred: ATTENTION,
  on_hold: ATTENTION,
  paused: ATTENTION,
  overdue: CRITICAL,
  critical: CRITICAL,
  disputed: CRITICAL,
  cancelled: CRITICAL,
  write_off: CRITICAL,
  open: NEUTRAL,
  not_invoiced: NEUTRAL,
};

export const getStatusColor = (status) => STATUS_COLORS[status] || NEUTRAL;

// Risk colors — analog: none = neutral, low = erledigt, medium/high = Aufmerksamkeit, critical = kritisch
export const RISK_COLORS = {
  none: 'bg-muted text-muted-foreground',
  low: 'bg-status-done-surface text-status-done-text',
  medium: 'bg-status-attention-surface text-status-attention',
  high: 'bg-status-attention-surface text-status-attention',
  critical: 'bg-status-critical-surface text-status-critical',
};

// Probability weighting
export const weightedAmount = (amount, probability) => {
  return (Number(amount) || 0) * ((Number(probability) || 100) / 100);
};

// Cashflow projection
export const calculateMonthlyProjection = (planLines, openingBalance = 0) => {
  const months = MONTHS_2026.map(m => {
    const inflows = planLines
      .filter(l => l.month === m && l.direction === 'inflow' && l.status !== 'cancelled')
      .reduce((s, l) => s + weightedAmount(l.amount_net, l.probability_percent), 0);
    const outflows = planLines
      .filter(l => l.month === m && l.direction === 'outflow' && l.status !== 'cancelled')
      .reduce((s, l) => s + (Number(l.amount_net) || 0), 0);
    return { month: m, inflows, outflows, net: inflows - outflows };
  });

  let balance = openingBalance;
  return months.map(m => {
    balance += m.net;
    return {
      ...m,
      closing: balance,
      gap: balance < 0 ? balance : 0,
      label: getMonthLabel(m.month)
    };
  });
};