// Was in einem Monat tatsächlich verrechnet bzw. ans Backoffice übermittelt ist.
// Wichtig: Rechnungen entstehen manchmal ausserhalb des Systems — dann wird nur die
// Rechnungsplanung auf „verrechnet" gestellt, ohne Abrechnungsanweisung. Diese Fälle
// zählen hier mit, sonst zeigt die Kennzahl zu wenig.
const INSTRUCTION_DONE = ['sent_to_backoffice', 'invoice_created', 'paid'];

export function invoicedKpi(instructions, plans) {
  const doneInstructions = instructions.filter(i => INSTRUCTION_DONE.includes(i.status));
  const manualPlans = plans.filter(p => p.billing_status === 'invoiced' && !p.linked_billing_instruction_id);
  return {
    amount:
      doneInstructions.reduce((s, i) => s + (Number(i.instruction_amount_net) || 0), 0) +
      manualPlans.reduce((s, p) => s + (Number(p.planned_amount_net) || 0), 0),
    count: doneInstructions.length + manualPlans.length,
    manualCount: manualPlans.length,
  };
}