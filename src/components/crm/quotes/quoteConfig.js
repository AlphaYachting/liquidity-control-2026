export const QUOTE_STATUS = {
  draft:     { label: 'Entwurf',      color: 'bg-gray-100 text-gray-600' },
  in_review: { label: 'In Prüfung',   color: 'bg-amber-100 text-amber-700' },
  sent:      { label: 'Versendet',    color: 'bg-blue-100 text-blue-700' },
  accepted:  { label: 'Angenommen ✓', color: 'bg-emerald-100 text-emerald-600' },
  declined:  { label: 'Abgelehnt',    color: 'bg-red-100 text-red-600' },
  expired:   { label: 'Abgelaufen',   color: 'bg-orange-100 text-orange-700' },
};

export const QUOTE_SOURCE = {
  transcript: { label: '📝 Transkript' },
  email:      { label: '✉️ Kunden-E-Mail' },
  voice_memo: { label: '🎙️ Sprachmemo' },
  manual:     { label: '✍️ Manuell' },
};

export const eur = (n) => `€${(Math.round((n || 0) * 100) / 100).toLocaleString('de-AT', { minimumFractionDigits: 2 })}`;

export const calcTotals = (items, vatRate = 20) => {
  const net = (items || []).reduce((s, i) => s + (Number(i.quantity) || 0) * (Number(i.unit_price) || 0), 0);
  return {
    total_net: Math.round(net * 100) / 100,
    total_gross: Math.round(net * (1 + (Number(vatRate) || 0) / 100) * 100) / 100,
  };
};