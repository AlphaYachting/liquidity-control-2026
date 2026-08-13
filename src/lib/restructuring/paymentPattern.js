// Zahlungsstaffeln: Verteilung eines Rechnungsbetrags auf Wochen ab der Rechnungswoche.

export const parseNumberList = (text) =>
  String(text || '')
    .split(/[,;\s]+/)
    .filter((s) => s !== '')
    .map((s) => Number(s.replace(',', '.')));

// Gibt eine Fehlermeldung im Klartext zurück oder null, wenn die Staffel gültig ist.
export function validatePattern(offsets, shares) {
  if (!Array.isArray(offsets) || offsets.length === 0) return 'Bitte mindestens einen Wochenversatz angeben.';
  if (!Array.isArray(shares) || shares.length === 0) return 'Bitte mindestens einen Anteil angeben.';
  if (offsets.some((n) => !Number.isFinite(n) || n < 0)) return 'Wochenversatz muss aus Zahlen ≥ 0 bestehen.';
  if (shares.some((n) => !Number.isFinite(n) || n < 0)) return 'Anteile müssen aus Zahlen ≥ 0 bestehen.';
  if (offsets.length !== shares.length) {
    return `Wochenversatz (${offsets.length} Werte) und Anteile (${shares.length} Werte) müssen gleich lang sein.`;
  }
  const sum = shares.reduce((s, n) => s + n, 0);
  if (Math.abs(sum - 100) > 0.001) {
    return `Die Anteile ergeben in Summe ${sum} % statt 100 %. Bitte korrigieren — es wird nicht gerundet.`;
  }
  return null;
}

// Vorschau: welcher Betrag fließt in welcher Planwoche (1-basiert)
export function patternPreview(pattern, amount = 10000, invoiceWeek = 4) {
  const offsets = pattern?.offsets_weeks || [];
  const shares = pattern?.shares_percent || [];
  return offsets.map((off, i) => ({
    week: invoiceWeek + Number(off),
    amount: (amount * (Number(shares[i]) || 0)) / 100,
  }));
}