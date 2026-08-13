import { base44 } from '@/api/base44Client';

const toNum = (v) => (v === '' || v === null || v === undefined ? null : Number(v));

/**
 * Speichert die Ist-Werte einer Planwoche (ein Datensatz je Plan und Woche)
 * und pflegt den Kontostand zugleich als BankBalanceSnapshot zum Wochenschluss.
 */
export async function saveWeeklyActual({ planId, weekIndex, weekEnd, values, existing, userEmail }) {
  const payload = {
    plan_id: planId,
    week_index: weekIndex,
    actual_inflow_gross: toNum(values.actual_inflow_gross),
    actual_outflow_gross: toNum(values.actual_outflow_gross),
    actual_bank_balance: toNum(values.actual_bank_balance),
    actual_inflow_neu_gross: toNum(values.actual_inflow_neu_gross),
    variance_reason: values.variance_reason || '',
    recorded_at: new Date().toISOString().slice(0, 10),
    recorded_by: userEmail || '',
  };

  let record = existing;
  if (existing) {
    record = await base44.entities.WeeklyActual.update(existing.id, payload);
  } else {
    const dupes = await base44.entities.WeeklyActual.filter({ plan_id: planId, week_index: weekIndex });
    record = dupes[0]
      ? await base44.entities.WeeklyActual.update(dupes[0].id, payload)
      : await base44.entities.WeeklyActual.create(payload);
  }

  if (payload.actual_bank_balance !== null && weekEnd) {
    const snaps = await base44.entities.BankBalanceSnapshot.filter({ balance_date: weekEnd });
    const snapData = {
      balance_date: weekEnd,
      amount: payload.actual_bank_balance,
      notes: `Wochenschluss W${weekIndex} — aus Soll-Ist-Cockpit`,
    };
    if (snaps[0]) await base44.entities.BankBalanceSnapshot.update(snaps[0].id, snapData);
    else await base44.entities.BankBalanceSnapshot.create(snapData);
  }

  return record;
}