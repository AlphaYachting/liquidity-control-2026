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

// Month helpers
export const MONTHS_2026 = [
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06',
  '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12'
];

export const MONTH_LABELS = {
  '2026-01': 'Jän', '2026-02': 'Feb', '2026-03': 'Mär', '2026-04': 'Apr',
  '2026-05': 'Mai', '2026-06': 'Jun', '2026-07': 'Jul', '2026-08': 'Aug',
  '2026-09': 'Sep', '2026-10': 'Okt', '2026-11': 'Nov', '2026-12': 'Dez'
};

export const getMonthLabel = (m) => MONTH_LABELS[m] || m;

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

// Status colors
export const STATUS_COLORS = {
  paid: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  invoiced: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  planned: 'bg-blue-100 text-blue-700 border-blue-200',
  active: 'bg-blue-100 text-blue-700 border-blue-200',
  uncertain: 'bg-amber-100 text-amber-700 border-amber-200',
  unclear: 'bg-amber-100 text-amber-700 border-amber-200',
  overdue: 'bg-red-100 text-red-700 border-red-200',
  critical: 'bg-red-100 text-red-700 border-red-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  open: 'bg-sky-100 text-sky-700 border-sky-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  on_hold: 'bg-amber-100 text-amber-700 border-amber-200',
  pending: 'bg-amber-100 text-amber-700 border-amber-200',
  paused: 'bg-gray-100 text-gray-500 border-gray-200',
  disputed: 'bg-purple-100 text-purple-700 border-purple-200',
};

export const getStatusColor = (status) => STATUS_COLORS[status] || 'bg-gray-100 text-gray-600 border-gray-200';

// Risk colors
export const RISK_COLORS = {
  none: 'bg-gray-100 text-gray-500',
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
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