// Geldflussplanung: Kategorien, Alt/Neu-Split-Regeln und Berechnungshilfen.
import { OUTFLOW_CATEGORY_LABELS } from './restructuringFormat';

export const INFLOW_CATEGORY_LABELS = {
  alt_debitoren: 'Alt-Debitoren',
  alt_schlussrechnung: 'Alt-Schlussrechnung',
  uebergangs_fakturierung: 'Übergangs-Fakturierung',
  projekt_neuleistung: 'Projekt-Neuleistung',
  wartungsvertrag: 'Wartungsvertrag',
  online_marketing: 'Online-Marketing',
  regie_support: 'Regie / Support',
  sonstige_einzahlung: 'Sonstige Einzahlung',
};

export const PLAN_CATEGORY_LABELS = { ...INFLOW_CATEGORY_LABELS, ...OUTFLOW_CATEGORY_LABELS };

export const categoriesFor = (direction) =>
  direction === 'outflow' ? OUTFLOW_CATEGORY_LABELS : INFLOW_CATEGORY_LABELS;

export const CLAIM_TYPE_LABELS = { alt: 'ALT', neu: 'NEU', gemischt: 'gemischt' };

export const SOURCE_TYPE_LABELS = {
  invoice: 'Rechnung',
  billing_instruction: 'Abrechnungsanweisung',
  order: 'Auftrag',
  contract: 'Vertrag',
  regie: 'Regie',
  massekosten: 'Massekosten',
  manual: 'manuell',
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Bei "alt"/"neu" werden die Anteile zwingend abgeleitet, nur "gemischt" ist frei.
export function deriveSplit(claimType, amountGross, altGross, neuGross) {
  const total = round2(amountGross);
  if (claimType === 'alt') return { amount_alt_gross: total, amount_neu_gross: 0 };
  if (claimType === 'neu') return { amount_alt_gross: 0, amount_neu_gross: total };
  return { amount_alt_gross: round2(altGross), amount_neu_gross: round2(neuGross) };
}

// Fehlermeldung im Klartext oder null.
export function validatePlanItem(item) {
  if (!item.label?.trim()) return 'Bitte eine Bezeichnung angeben.';
  if (!item.claim_type) return 'Bitte die Abgrenzung zum Stichtag (ALT / NEU / gemischt) angeben.';
  if (item.source_type === 'manual' && !item.derivation?.trim()) {
    return 'Bei manuellen Positionen ist die Herleitung des Betrags verpflichtend.';
  }
  if (item.claim_type === 'gemischt') {
    const sum = round2(Number(item.amount_alt_gross) || 0) + round2(Number(item.amount_neu_gross) || 0);
    if (Math.abs(sum - round2(item.amount_gross)) > 0.005) {
      return `Alt- und Neuanteil ergeben ${sum.toFixed(2)} € statt ${round2(item.amount_gross).toFixed(2)} €. Bitte korrigieren.`;
    }
  }
  return null;
}

// Berechnungshilfe: Altanteil = min(Rechnungsbetrag, max(0, Fortschritt% × Auftragssumme − bereits fakturiert))
export function suggestAltShare({ amountGross, progressPercent, orderTotalGross, alreadyInvoicedGross = 0 }) {
  const amount = Number(amountGross) || 0;
  const progress = Number(progressPercent) || 0;
  const order = Number(orderTotalGross) || 0;
  const invoiced = Number(alreadyInvoicedGross) || 0;
  const earned = (progress / 100) * order;
  const alt = Math.min(amount, Math.max(0, earned - invoiced));
  return {
    alt: round2(alt),
    neu: round2(amount - alt),
    derivation:
      `Altanteil = min(${amount.toFixed(2)} €; max(0; ${progress}% × ${order.toFixed(2)} € − ${invoiced.toFixed(2)} € bereits fakturiert)) ` +
      `= ${round2(alt).toFixed(2)} €; Neuanteil ${round2(amount - alt).toFixed(2)} €.`,
  };
}

// Nettobetrag einer Quelle mit dem USt-Satz der Position auf brutto umrechnen.
export const netToGross = (net, vatRate) => round2((Number(net) || 0) * (1 + (Number(vatRate) || 0) / 100));