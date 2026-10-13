import { base44 } from '@/api/base44Client';

// Die Rechnung in sevDesk führt — die Verrechnungsplanung folgt ihrer Anweisung.
// Gleiche Regel wie im Backend (base44/shared/billingFollow.js):
// vorwärts: Anweisung verrechnet/bezahlt → Planung „verrechnet“;
// rückwärts nur bei echtem Rückfall (vorher verrechnet, jetzt nicht mehr) → „geplant“.
export const VERRECHNET = ['invoice_created', 'paid'];

export async function planFolgtAnweisung(instrId, neuerStatus, alterStatus) {
  if (!instrId || !neuerStatus) return 0;
  const vorwaerts = VERRECHNET.includes(neuerStatus);
  const rueckfall = !vorwaerts && VERRECHNET.includes(alterStatus);
  if (!vorwaerts && !rueckfall) return 0;
  const plaene = await base44.entities.MonthlyBillingPlan.filter({ linked_billing_instruction_id: instrId }, '-created_date', 50);
  let geaendert = 0;
  for (const p of plaene) {
    if (vorwaerts && p.billing_status !== 'invoiced') {
      await base44.entities.MonthlyBillingPlan.update(p.id, { billing_status: 'invoiced' });
      geaendert++;
    } else if (rueckfall && p.billing_status === 'invoiced') {
      await base44.entities.MonthlyBillingPlan.update(p.id, { billing_status: 'planned' });
      geaendert++;
    }
  }
  return geaendert;
}

// Anweisung speichern; ändert sich dabei der Status, zieht die Planung nach.
// `vorher` ist der bisherige Datensatz (für den alten Status).
export async function anweisungSpeichern(id, patch, vorher) {
  await base44.entities.BillingInstruction.update(id, patch);
  if (patch && Object.prototype.hasOwnProperty.call(patch, 'status') && patch.status !== vorher?.status) {
    await planFolgtAnweisung(id, patch.status, vorher?.status);
  }
}

// Anzeige: wirksamer Planungsstand. Ist die verknüpfte Anweisung verrechnet oder
// bezahlt, gilt die Planung als verrechnet — auch bevor der gespeicherte Stand nachgezogen ist.
export function wirksamerPlanStatus(plan, anweisungNachId) {
  const instr = plan?.linked_billing_instruction_id ? anweisungNachId?.[plan.linked_billing_instruction_id] : null;
  if (instr && VERRECHNET.includes(instr.status)) return 'invoiced';
  return plan?.billing_status;
}

// Alle Abfragen, die Planungs- oder Anweisungsstände zeigen, neu laden.
export function abrechnungNeuLaden(queryClient) {
  queryClient.invalidateQueries({ queryKey: ['billingInstructions'] });
  queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlans'] });
  queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlansAll'] });
  queryClient.invalidateQueries({ queryKey: ['projektAbrechnung'] });
  queryClient.invalidateQueries({ queryKey: ['invoiceRecords'] });
  queryClient.invalidateQueries({ queryKey: ['invoiceRecords-project'] });
}
