// Echter Stand einer Abrechnungsanweisung für die Anzeige — statt eines pauschalen grünen Hakens.
// Die Rechnung in sevDesk führt: Entwurf in sevDesk → verrechnet (mit Rechnungsnummer) → bezahlt.
// Nur Anzeige, wird nie gespeichert.

export function rechnungZuAnweisung(instr, rechnungen = []) {
  if (!instr) return null;
  return rechnungen.find((r) => (instr.linked_invoice_id && r.id === instr.linked_invoice_id)
    || (instr.sevdesk_invoice_id && String(r.sevdesk_id) === String(instr.sevdesk_invoice_id))) || null;
}

export function anweisungsStand(instr, rechnung) {
  if (!instr) return { label: 'Anweisung nicht mehr vorhanden', klasse: 'bg-gray-100 text-gray-500' };
  const nr = rechnung?.invoice_number ? ` · RE ${rechnung.invoice_number}` : '';
  switch (instr.status) {
    case 'draft': return { label: 'Anweisung: Entwurf', klasse: 'bg-gray-100 text-gray-600' };
    case 'ready_for_backoffice': return { label: 'Anweisung bereit', klasse: 'bg-blue-100 text-blue-700' };
    case 'sent_to_backoffice': return instr.sevdesk_invoice_id
      ? { label: 'Entwurf in sevDesk', klasse: 'bg-amber-100 text-amber-700' }
      : { label: 'An Backoffice gesendet', klasse: 'bg-amber-100 text-amber-700' };
    case 'invoice_created': return { label: `Verrechnet${nr}`, klasse: 'bg-emerald-100 text-emerald-700' };
    case 'paid': return { label: `Bezahlt${nr}`, klasse: 'bg-emerald-600 text-white' };
    case 'blocked': return { label: 'Anweisung blockiert', klasse: 'bg-red-100 text-red-700' };
    case 'cancelled': return { label: 'Anweisung storniert', klasse: 'bg-gray-200 text-gray-500' };
    default: return { label: 'Anweisung erstellt', klasse: 'bg-gray-100 text-gray-600' };
  }
}
