import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

async function fetchAll() {
  const [projects, orders, invoices, contracts, timeEntries, outflowItems, bankSnapshots, projectSnapshots, settings] = await Promise.all([
    base44.entities.LiquidityProject.list('-created_date', 1000),
    base44.entities.ConfirmedOrder.list('-created_date', 1000),
    base44.entities.InvoiceRecord.list('-invoice_date', 2000),
    base44.entities.RecurringContract.list('-created_date', 1000),
    base44.entities.AworkTimeEntry.list('-entry_date', 5000),
    base44.entities.CashOutflowItem.list('-created_date', 500),
    base44.entities.BankBalanceSnapshot.list('-balance_date', 200),
    base44.entities.AworkProjectSnapshot.list('-last_synced_at', 1000),
    base44.entities.RestructuringSetting.list('-created_date', 1),
  ]);
  return {
    projects, orders, invoices, contracts, timeEntries, outflowItems, bankSnapshots, projectSnapshots,
    setting: settings[0] || {},
  };
}

export function useRestructuringData() {
  return useQuery({
    queryKey: ['restructuring-data'],
    queryFn: fetchAll,
    staleTime: 60 * 1000,
  });
}