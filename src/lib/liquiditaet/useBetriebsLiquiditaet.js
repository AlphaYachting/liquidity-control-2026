import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { STICHTAG_FORTBETRIEB } from './betriebsLiquiditaet';

export const LIQ_KEY = ['betriebs-liquiditaet'];

// Lädt nur, was die Betriebsliquidität braucht — gefiltert auf dem Server.
async function laden() {
  const offeneAnweisung = ['draft', 'ready_for_backoffice', 'sent_to_backoffice'];
  const [snapshots, kosten, rechnungen, vertraege, etappen, anweisungen, zeiten] = await Promise.all([
    base44.entities.BankBalanceSnapshot.list('-balance_date', 200),
    base44.entities.CashOutflowItem.list('-created_date', 500),
    base44.entities.InvoiceRecord.filter({ invoice_date: { $gte: '2025-01-01' } }, '-invoice_date', 3000),
    base44.entities.RecurringContract.filter({ status: 'active' }, '-created_date', 1000),
    base44.entities.Milestone.filter({ milestone_amount: { $gt: 0 } }, 'order', 500),
    base44.entities.BillingInstruction.filter({ status: { $in: offeneAnweisung } }, '-created_date', 500),
    base44.entities.TimeEntry.filter(
      { abrechnungsstatus: 'offen', kategorie: { $in: ['aufwand', 'support'] }, entry_date: { $gte: STICHTAG_FORTBETRIEB } },
      '-entry_date', 3000,
    ),
  ]);
  const sprintIds = [...new Set(etappen.map((m) => m.sprint_id).filter(Boolean))];
  const sprints = sprintIds.length ? await base44.entities.Sprint.filter({ id: { $in: sprintIds } }, 'start_date', 200) : [];
  const projektIds = [...new Set(sprints.map((s) => s.project_id).filter(Boolean))];
  const projekte = projektIds.length ? await base44.entities.Project.filter({ id: { $in: projektIds } }, 'title', 200) : [];
  const kundenIds = [...new Set(projekte.map((p) => p.client_id).filter(Boolean))];
  const kunden = kundenIds.length ? await base44.entities.Client.filter({ id: { $in: kundenIds } }, 'name', 200) : [];

  // Lieferfähigkeit, Monatsblick und Wochenliste — alles nur lesend
  const etappenIds = etappen.filter((m) => !m.invoiced_at).map((m) => m.id);
  const [personen, tickets, einstellungZeilen, mahnungen, deals] = await Promise.all([
    base44.entities.TeamMember.list('name', 200),
    etappenIds.length ? base44.entities.Ticket.filter({ milestone_id: { $in: etappenIds } }, 'order', 2000) : [],
    base44.entities.Setting.filter({ group: 'liquiditaet' }, 'key', 20).catch(() => []),
    base44.entities.DunningRecord.list('-created_date', 500).catch(() => []),
    base44.entities.CrmDeal.list('-updated_date', 500).catch(() => []),
  ]);
  const ticketIds = tickets.map((t) => t.id);
  const ticketZeiten = ticketIds.length
    ? await base44.entities.TimeEntry.filter({ ticket_id: { $in: ticketIds } }, '-entry_date', 5000)
    : [];
  const einstellungen = {};
  einstellungZeilen.forEach((s) => {
    try { einstellungen[String(s.key).replace('liquiditaet_', '')] = JSON.parse(s.value || '{}'); } catch (e) { /* ungültiger Wert wird ignoriert */ }
  });
  return {
    snapshots, kosten, rechnungen, vertraege, etappen, sprints, projekte, kunden, anweisungen, zeiten,
    personen, tickets, ticketZeiten, einstellungen, einstellungZeilen, mahnungen, deals,
  };
}

// Speichert einen Liquiditäts-Einstellungswert (eigene Gruppe, berührt keine anderen Einstellungen).
export async function speichereEinstellung(zeilen, schluessel, wert, label) {
  const key = `liquiditaet_${schluessel}`;
  const vorhanden = (zeilen || []).find((s) => s.key === key);
  const value = JSON.stringify(wert || {});
  if (vorhanden) await base44.entities.Setting.update(vorhanden.id, { value });
  else await base44.entities.Setting.create({ key, value, group: 'liquiditaet', label });
}

export function useBetriebsLiquiditaetDaten() {
  return useQuery({ queryKey: LIQ_KEY, queryFn: laden, staleTime: 60 * 1000 });
}
