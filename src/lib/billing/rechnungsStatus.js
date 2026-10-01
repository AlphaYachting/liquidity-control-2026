// Anzeige-Status einer Rechnung — nur Anzeige, wird nie gespeichert.
const fmtTag = (d) => (d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
const fmtEur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(Number(v) || 0);

export const TON_KLASSEN = {
  grau: 'bg-muted text-muted-foreground',
  gruen: 'bg-emerald-100 text-emerald-700',
  gelb: 'bg-status-attention-surface text-status-attention',
  rot: 'bg-status-critical-surface text-status-critical',
  neutral: 'bg-status-info-surface text-status-info',
};

export const istEntwurf = (inv) => inv.payment_status === 'draft' || inv.is_sent === false;

// Netto mit Vorzeichen: Gutschriften negativ
export const nettoVorzeichen = (inv) => (inv.is_credit_note ? -Math.abs(Number(inv.net_amount) || 0) : Number(inv.net_amount) || 0);

export function rechnungsStatus(inv, heute = new Date()) {
  const s = inv.payment_status;
  if (s === 'cancelled') return { key: 'storniert', label: 'storniert', ton: 'grau', zaehltAlsVerrechnet: false };
  if (istEntwurf(inv)) return { key: 'entwurf', label: 'Entwurf in sevDesk — nicht versendet', ton: 'grau', zaehltAlsVerrechnet: false };
  if (inv.is_credit_note) return { key: 'gutschrift', label: 'Gutschrift/Storno', ton: 'grau', zaehltAlsVerrechnet: true };
  if (s === 'paid') return { key: 'bezahlt', label: `bezahlt am ${fmtTag(inv.payment_date)}`, ton: 'gruen', zaehltAlsVerrechnet: true };
  if (s === 'partially_paid') return { key: 'teilbezahlt', label: `teilbezahlt — offen ${fmtEur(inv.open_amount)} brutto`, ton: 'gelb', zaehltAlsVerrechnet: true };
  const tag = new Date(heute); tag.setHours(0, 0, 0, 0);
  if ((s === 'open' || s === 'overdue') && inv.due_date && new Date(inv.due_date) < tag) {
    const n = Math.floor((tag - new Date(inv.due_date)) / 86400000);
    return { key: 'ueberfaellig', label: `überfällig seit ${n} Tagen`, ton: 'rot', zaehltAlsVerrechnet: true };
  }
  if (s === 'open' || s === 'overdue') return { key: 'offen', label: `offen, fällig ${fmtTag(inv.due_date)}`, ton: 'neutral', zaehltAlsVerrechnet: true };
  return { key: s || 'unklar', label: s === 'unclear' ? 'unklar' : (s || 'unklar'), ton: 'grau', zaehltAlsVerrechnet: true };
}