/**
 * Master Data Import & Reconciliation Utilities
 * Safe, non-destructive helpers for the PM project data import workflow.
 */

// ─── Customer Name Normalization ──────────────────────────────────────────────

export function normalizeCustomerName(name = '') {
  if (!name) return '';
  let n = name.trim();
  // Remove trailing punctuation
  n = n.replace(/[.,;:!?]+$/, '').trim();
  // Normalize GmbH variants
  n = n.replace(/\bGesmbH\b/gi, 'GmbH');
  n = n.replace(/\bGmbH\.\b/gi, 'GmbH');
  n = n.replace(/\bGmbh\b/g, 'GmbH');
  // Normalize & / und
  n = n.replace(/\s+&\s+/g, ' & ');
  n = n.replace(/\s+und\s+/gi, ' & ');
  // Remove duplicate spaces
  n = n.replace(/\s+/g, ' ').trim();
  return n;
}

// ─── Simple fuzzy similarity (0-1) ───────────────────────────────────────────

export function stringSimilarity(a = '', b = '') {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 1;
  if (!s1 || !s2) return 0;
  // Longer string as base
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.includes(shorter)) return 0.85;
  // Token overlap
  const t1 = new Set(s1.split(/[\s\-_,./]+/).filter(t => t.length > 2));
  const t2 = new Set(s2.split(/[\s\-_,./]+/).filter(t => t.length > 2));
  const intersection = [...t1].filter(t => t2.has(t)).length;
  const union = new Set([...t1, ...t2]).size;
  return union > 0 ? intersection / union : 0;
}

// ─── Active Project Detection ─────────────────────────────────────────────────

const ACTIVE_STATUS_KEYWORDS = ['aktiv', 'active', 'offen', 'laufend', 'in arbeit', 'in bearbeitung', 'in progress'];
const INACTIVE_STATUS_KEYWORDS = ['abgeschlossen', 'closed', 'cancelled', 'storniert', 'fertig', 'done', 'completed', 'archiviert'];

export function detectActiveProject(row) {
  const reasons = [];
  let score = 0;

  const status = (row.project_status || '').toLowerCase();
  const billing = (row.billing_status || '').toLowerCase();

  // Explicit active status
  if (ACTIVE_STATUS_KEYWORDS.some(k => status.includes(k))) {
    reasons.push('Status aktiv');
    score += 40;
  }
  // Explicit inactive status — hard override
  if (INACTIVE_STATUS_KEYWORDS.some(k => status.includes(k) || billing.includes(k))) {
    return { is_active: false, reason: 'Status abgeschlossen/storniert', confidence: 90 };
  }
  // Open amount
  if ((row.open_amount_net || 0) > 0) {
    reasons.push(`Offener Betrag: €${row.open_amount_net}`);
    score += 30;
  }
  if ((row.open_percent || 0) > 0) {
    reasons.push(`Offener %: ${row.open_percent}%`);
    score += 10;
  }
  // Expected billing
  if ((row.expected_current_month_amount_net || 0) > 0 || (row.expected_next_month_amount_net || 0) > 0) {
    reasons.push('Erwartete Abrechnung vorhanden');
    score += 20;
  }
  // Total order > 0 but not fully invoiced
  if ((row.total_order_amount_net || 0) > 0 && (row.already_invoiced_percent || 0) < 99) {
    reasons.push('Auftragssumme nicht vollständig verrechnet');
    score += 15;
  }
  // Notes present (sign of active project)
  if (row.notes || row.next_invoice_note) {
    reasons.push('Notizen vorhanden');
    score += 5;
  }
  // If score very low and no order amount → inactive
  if (score < 20 && (row.total_order_amount_net || 0) === 0) {
    return { is_active: false, reason: 'Keine Auftragssumme und kein Statushinweis', confidence: 60 };
  }

  const confidence = Math.min(95, score);
  return {
    is_active: confidence >= 25,
    reason: reasons.join(' · ') || 'Keine eindeutigen Aktivitätssignale',
    confidence
  };
}

// ─── Customer Matching ────────────────────────────────────────────────────────

export function findCustomerMatches(normalizedName, existingProjects, existingOrders, existingInvoices) {
  const candidates = [];

  // From projects
  existingProjects.forEach(p => {
    const pNorm = normalizeCustomerName(p.customer || '');
    const sim = stringSimilarity(normalizedName, pNorm);
    if (sim > 0.4) candidates.push({ source: 'project', id: p.id, raw: p.customer, normalized: pNorm, similarity: sim });
  });

  // From orders
  existingOrders.forEach(o => {
    const oNorm = normalizeCustomerName(o.customer || '');
    const sim = stringSimilarity(normalizedName, oNorm);
    if (sim > 0.4) candidates.push({ source: 'order', id: o.id, raw: o.customer, normalized: oNorm, similarity: sim });
  });

  // From invoices
  existingInvoices.forEach(i => {
    const iNorm = normalizeCustomerName(i.customer_name || '');
    const sim = stringSimilarity(normalizedName, iNorm);
    if (sim > 0.4) candidates.push({ source: 'invoice', id: i.id, raw: i.customer_name, normalized: iNorm, similarity: sim });
  });

  // Deduplicate by normalized name, keep highest similarity
  const deduped = {};
  candidates.forEach(c => {
    const key = c.normalized;
    if (!deduped[key] || deduped[key].similarity < c.similarity) {
      deduped[key] = c;
    }
  });

  return Object.values(deduped).sort((a, b) => b.similarity - a.similarity).slice(0, 5);
}

// ─── Project Matching ─────────────────────────────────────────────────────────

export function findProjectMatches(row, existingProjects) {
  const normName = (row.project_name_normalized || row.project_name_raw || '').toLowerCase();
  const normCustomer = (row.customer_name_normalized || '').toLowerCase();

  const results = existingProjects.map(p => {
    const pName = (p.project_name || '').toLowerCase();
    const pCustomer = (p.customer || '').toLowerCase();
    const nameSim = stringSimilarity(normName, pName);
    const customerSim = stringSimilarity(normCustomer, pCustomer);
    // Combined score: name is more important
    const combined = nameSim * 0.65 + customerSim * 0.35;
    let reason = [];
    if (nameSim >= 0.9) reason.push('Exakter Projektname');
    else if (nameSim >= 0.7) reason.push('Ähnlicher Projektname');
    if (customerSim >= 0.9) reason.push('Exakter Kundenname');
    else if (customerSim >= 0.6) reason.push('Ähnlicher Kundenname');
    if (p.project_manager && row.project_manager && p.project_manager === row.project_manager) reason.push('Gleicher PM');
    return { project: p, score: combined, reason: reason.join(' · ') };
  });

  return results.filter(r => r.score > 0.4).sort((a, b) => b.score - a.score).slice(0, 3);
}

// ─── Order Matching ───────────────────────────────────────────────────────────

export function findOrderMatches(row, existingOrders, matchedProjectId) {
  const results = [];
  const excelAmount = row.total_order_amount_net || 0;
  const normCustomer = (row.customer_name_normalized || '').toLowerCase();
  const normProject = (row.project_name_normalized || '').toLowerCase();

  existingOrders.forEach(o => {
    let score = 0;
    const reasons = [];

    // Direct project link (strongest signal)
    if (matchedProjectId && o.project_id === matchedProjectId) {
      score += 50;
      reasons.push('Direkt mit Projekt verknüpft');
    }
    // Customer match
    const custSim = stringSimilarity(normCustomer, (o.customer || '').toLowerCase());
    if (custSim >= 0.85) { score += 20; reasons.push('Kundenname passt'); }
    else if (custSim >= 0.6) { score += 10; reasons.push('Kundenname ähnlich'); }

    // Project name match
    const projSim = stringSimilarity(normProject, (o.project_name || '').toLowerCase());
    if (projSim >= 0.8) { score += 20; reasons.push('Projektname passt'); }
    else if (projSim >= 0.6) { score += 10; reasons.push('Projektname ähnlich'); }

    // Amount match
    if (excelAmount > 0 && o.total_net_amount > 0) {
      const diff = Math.abs(excelAmount - o.total_net_amount);
      const pct = diff / excelAmount;
      if (pct <= 0.01) { score += 25; reasons.push('Betrag identisch'); }
      else if (pct <= 0.05) { score += 15; reasons.push('Betrag nahezu gleich'); }
      else if (pct <= 0.15) { score += 5; reasons.push('Betrag ähnlich'); }
    }

    if (score >= 20) results.push({ order: o, score: Math.min(100, score), reason: reasons.join(' · ') });
  });

  return results.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ─── Invoice Matching ─────────────────────────────────────────────────────────

export function findInvoiceMatches(row, existingInvoices, matchedProjectId, matchedOrderId) {
  const normCustomer = (row.customer_name_normalized || '').toLowerCase();
  const excelInvoiced = row.already_invoiced_net || 0;

  return existingInvoices
    .filter(i => i.payment_status !== 'cancelled')
    .map(inv => {
      let score = 0;
      const reasons = [];

      if (matchedProjectId && inv.project_id === matchedProjectId) { score += 50; reasons.push('Projekt verknüpft'); }
      if (matchedOrderId && inv.confirmed_order_id === matchedOrderId) { score += 40; reasons.push('Auftrag verknüpft'); }
      const custSim = stringSimilarity(normCustomer, (inv.customer_name || '').toLowerCase());
      if (custSim >= 0.85) { score += 20; reasons.push('Kunde passt'); }
      else if (custSim >= 0.6) { score += 10; }

      return score >= 20
        ? { invoice: inv, score: Math.min(100, score), reason: reasons.join(' · ') }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

// ─── Financial Reconciliation ─────────────────────────────────────────────────

export function reconcileFinancials(row, appData) {
  const results = [];
  const THRESH = { balanced: 1, minor: 5, warning: 50 };

  function check(label, excelVal, appVal) {
    const diff = Math.abs((excelVal || 0) - (appVal || 0));
    let status = diff <= THRESH.balanced ? 'balanced' : diff <= THRESH.minor ? 'minor_difference' : diff <= THRESH.warning ? 'warning' : 'critical';
    return { label, excel: excelVal || 0, app: appVal || 0, diff, status };
  }

  results.push(check('Auftragssumme netto', row.total_order_amount_net, appData.order_total_net));
  results.push(check('Bereits verrechnet netto', row.already_invoiced_net, appData.invoiced_net));
  results.push(check('Offener Betrag netto', row.open_amount_net, appData.open_to_invoice_net));

  const worst = results.reduce((w, r) => {
    const ord = ['balanced', 'minor_difference', 'warning', 'critical'];
    return ord.indexOf(r.status) > ord.indexOf(w) ? r.status : w;
  }, 'balanced');

  return { checks: results, overall_status: worst };
}

// ─── Column mapping heuristics ────────────────────────────────────────────────

const COLUMN_PATTERNS = [
  { field: 'customer_name_raw', patterns: ['kunde', 'customer', 'auftraggeber', 'klient', 'firma'] },
  { field: 'project_name_raw', patterns: ['projekt', 'project', 'bezeichnung', 'titel', 'name', 'auftrag'] },
  { field: 'project_manager', patterns: ['pm', 'projektleiter', 'projekt manager', 'project manager', 'verantwortlich', 'betreuer'] },
  { field: 'project_status', patterns: ['status', 'projektstatus', 'zustand', 'phase'] },
  { field: 'billing_status', patterns: ['verrechnung', 'rechnungsstatus', 'abrechnungsstatus', 'billing'] },
  { field: 'total_order_amount_net', patterns: ['auftragssumme', 'gesamtbetrag', 'netto gesamt', 'auftragsvolumen', 'betrag gesamt', 'summe netto', 'order amount', 'total'] },
  { field: 'already_invoiced_net', patterns: ['verrechnet', 'bereits verrechnet', 'fakturiert', 'invoiced', 'rechnung netto'] },
  { field: 'already_invoiced_percent', patterns: ['verrechnet %', 'fakturiert %', '% verrechnet', 'invoiced %'] },
  { field: 'open_amount_net', patterns: ['offen', 'offener betrag', 'restbetrag', 'noch zu verrechnen', 'open amount'] },
  { field: 'open_percent', patterns: ['offen %', '% offen', 'rest %', 'open %'] },
  { field: 'expected_current_month_amount_net', patterns: ['aktueller monat', 'laufender monat', 'current month', 'juni', 'mai', 'april'] },
  { field: 'expected_next_month_amount_net', patterns: ['nächster monat', 'next month', 'folgemonat'] },
  { field: 'risk_status', patterns: ['risiko', 'risk', 'priorität', 'priority'] },
  { field: 'notes', patterns: ['anmerkung', 'notiz', 'kommentar', 'note', 'bemerkung', 'info'] },
  { field: 'next_invoice_note', patterns: ['nächste rechnung', 'next invoice', 'invoice note', 'abrechnungshinweis'] },
];

export function autoMapColumns(headers = []) {
  const mapping = {};
  const used = new Set();

  headers.forEach((header, idx) => {
    const h = (header || '').toLowerCase().trim();
    for (const { field, patterns } of COLUMN_PATTERNS) {
      if (used.has(field)) continue;
      if (patterns.some(p => h.includes(p) || p.includes(h))) {
        mapping[idx] = { field, confidence: h === patterns[0] ? 1 : 0.8, header };
        used.add(field);
        break;
      }
    }
    if (!mapping[idx]) {
      mapping[idx] = { field: null, confidence: 0, header };
    }
  });

  return mapping;
}

export function applyColumnMapping(rawRows, columnMapping) {
  return rawRows.map((row, rowIdx) => {
    const mapped = { row_number: rowIdx + 1, raw_row_json: JSON.stringify(row) };
    Object.entries(columnMapping).forEach(([colIdx, { field }]) => {
      if (!field) return;
      const val = row[parseInt(colIdx)];
      if (val !== undefined && val !== null && val !== '') {
        // Convert numeric fields
        const numericFields = [
          'total_order_amount_net', 'already_invoiced_net', 'already_invoiced_percent',
          'open_amount_net', 'open_percent', 'expected_current_month_amount_net',
          'expected_current_month_percent', 'expected_next_month_amount_net', 'expected_next_month_percent'
        ];
        if (numericFields.includes(field)) {
          const n = parseFloat(String(val).replace(/[€$,\s]/g, '').replace(',', '.'));
          mapped[field] = isNaN(n) ? 0 : n;
        } else {
          mapped[field] = String(val).trim();
        }
      }
    });
    // Normalize customer & project names
    if (mapped.customer_name_raw) {
      mapped.customer_name_normalized = normalizeCustomerName(mapped.customer_name_raw);
    }
    if (mapped.project_name_raw) {
      mapped.project_name_normalized = (mapped.project_name_raw || '').trim();
    }
    return mapped;
  });
}

export const RECONCILIATION_COLORS = {
  balanced: 'text-emerald-600 bg-emerald-50',
  minor_difference: 'text-blue-600 bg-blue-50',
  warning: 'text-amber-600 bg-amber-50',
  critical: 'text-red-600 bg-red-50',
  unchecked: 'text-muted-foreground bg-muted',
};

export const MATCH_STATUS_COLORS = {
  unmatched: 'bg-gray-100 text-gray-600',
  suggested: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  conflict: 'bg-red-100 text-red-700',
  ignored: 'bg-gray-100 text-gray-400',
};

export function formatCurrency(v) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}