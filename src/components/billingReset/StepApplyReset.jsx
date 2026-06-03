import React, { useState, useMemo } from 'react';
import { ShieldAlert, CheckCircle2, AlertTriangle, Loader2, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { RELEVANCE_LABELS } from '@/lib/billingRelevanceUtils';

const ARCHIVE_STATUSES = ['archived', 'not_billing_relevant', 'inactive'];

export default function StepApplyReset({ classified, alignActions, reconciled, session, onComplete }) {
  const [confirmed, setConfirmed] = useState(false);
  const [applying, setApplying] = useState(false);
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(false);

  const plan = useMemo(() => {
    const actions = [];
    const now = new Date().toISOString();

    // 1. Archive/exclude irrelevant projects
    classified.forEach(c => {
      if (!c.projectId || !c.matchedProject) return;
      if (ARCHIVE_STATUSES.includes(c.effectiveRelevance)) {
        actions.push({
          type: 'archive_project',
          label: `Archivieren: ${c.matchedProject.project_name}`,
          data: {
            billing_relevance_status: c.effectiveRelevance,
            is_active_for_billing: false,
            excluded_from_project_cockpit: true,
            excluded_from_forecast: true,
            exclusion_reason: `Excel-Master-Reset: ${RELEVANCE_LABELS[c.effectiveRelevance]}`,
            archived_at: now,
            archived_by: 'excel_master_reset',
            archive_source: 'excel_master_reset',
            excel_reset_batch_id: session?.id || '',
          },
          projectId: c.projectId,
        });
      } else {
        // Mark active/future projects as billing relevant
        actions.push({
          type: 'activate_project',
          label: `Aktivieren: ${c.matchedProject.project_name} (${RELEVANCE_LABELS[c.effectiveRelevance]})`,
          data: {
            billing_relevance_status: c.effectiveRelevance,
            is_active_for_billing: true,
            excluded_from_project_cockpit: false,
            excluded_from_forecast: ['active_billing_relevant', 'future_billing_relevant'].includes(c.effectiveRelevance) ? false : true,
            excel_reset_batch_id: session?.id || '',
          },
          projectId: c.projectId,
        });
      }
    });

    // 2. Apply Excel values to projects (from align step)
    alignActions.forEach(a => {
      if (!a.matchedProject) {
        // Create new project
        actions.push({
          type: 'create_project',
          label: `Neu anlegen: ${a.row.project_name_raw}`,
          row: a.row,
          relevance: a.effectiveRelevance,
        });
      } else if (a.diffs && a.diffs.length > 0) {
        // Update existing project with Excel values
        const updateData = {};
        if (a.row.total_order_amount_net != null) updateData.total_net_amount = a.row.total_order_amount_net;
        if (a.row.open_amount_net != null) updateData.open_amount = a.row.open_amount_net;
        if (a.row.already_invoiced_net != null) updateData.already_invoiced_amount = a.row.already_invoiced_net;
        if (a.row.notes_next_invoice) updateData.notes_next_invoice = a.row.notes_next_invoice;
        if (a.row.project_manager) updateData.project_manager = a.row.project_manager;
        updateData.excel_total_order_net = a.row.total_order_amount_net || 0;
        updateData.excel_already_invoiced_net = a.row.already_invoiced_net || 0;
        updateData.excel_open_amount_net = a.row.open_amount_net || 0;
        updateData.excel_expected_current_month_net = a.row.expected_current_month_amount_net || 0;
        updateData.excel_expected_next_month_net = a.row.expected_next_month_amount_net || 0;
        updateData.excel_last_synced_at = new Date().toISOString();
        actions.push({
          type: 'update_project_values',
          label: `Werte aktualisieren: ${a.matchedProject.project_name} (${a.diffs.length} Felder)`,
          projectId: a.matchedProject.id,
          updateData,
        });
      }

      // 3. Create/update MonthlyBillingPlan for current + next month
      if (a.matchedProject && ((a.row.expected_current_month_amount_net || 0) > 0 || (a.row.expected_next_month_amount_net || 0) > 0)) {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const nextMonthDate = new Date(now); nextMonthDate.setMonth(now.getMonth() + 1);
        const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

        if ((a.row.expected_current_month_amount_net || 0) > 0) {
          actions.push({
            type: 'upsert_billing_plan',
            label: `Abrechnungsplan ${currentMonth}: ${a.matchedProject.project_name}`,
            projectId: a.matchedProject.id,
            planData: {
              project_id: a.matchedProject.id,
              planning_month: currentMonth,
              planning_type: 'current_month',
              planned_amount_net: a.row.expected_current_month_amount_net,
              planned_percent: a.row.expected_current_month_percent || 0,
              billing_status: 'open',
              invoice_reason: a.row.notes_next_invoice || '',
              assigned_pm: a.row.project_manager || '',
            },
          });
        }
        if ((a.row.expected_next_month_amount_net || 0) > 0) {
          actions.push({
            type: 'upsert_billing_plan',
            label: `Abrechnungsplan ${nextMonth}: ${a.matchedProject.project_name}`,
            projectId: a.matchedProject.id,
            planData: {
              project_id: a.matchedProject.id,
              planning_month: nextMonth,
              planning_type: 'next_month',
              planned_amount_net: a.row.expected_next_month_amount_net,
              planned_percent: a.row.expected_next_month_percent || 0,
              billing_status: 'open',
              invoice_reason: a.row.notes_next_invoice || '',
              assigned_pm: a.row.project_manager || '',
            },
          });
        }
      }
    });

    return actions;
  }, [classified, alignActions, session]);

  async function applyAll() {
    setApplying(true);
    const results = [];

    for (const action of plan) {
      try {
        if (action.type === 'archive_project' || action.type === 'activate_project') {
          await base44.entities.LiquidityProject.update(action.projectId, action.data);
          results.push({ label: action.label, status: 'ok' });
        }
        else if (action.type === 'create_project') {
          const r = action.row;
          await base44.entities.LiquidityProject.create({
            project_name: r.project_name_raw,
            customer: r.customer_name_normalized || r.customer_name_raw,
            project_manager: r.project_manager || '',
            total_net_amount: r.total_order_amount_net || 0,
            already_invoiced_amount: r.already_invoiced_net || 0,
            open_amount: r.open_amount_net || 0,
            notes_next_invoice: r.notes_next_invoice || '',
            status: 'active',
            billing_relevance_status: action.relevance || 'active_billing_relevant',
            is_active_for_billing: true,
            excel_total_order_net: r.total_order_amount_net || 0,
            excel_expected_current_month_net: r.expected_current_month_amount_net || 0,
            excel_expected_next_month_net: r.expected_next_month_amount_net || 0,
            excel_last_synced_at: new Date().toISOString(),
            excel_reset_batch_id: session?.id || '',
          });
          results.push({ label: action.label, status: 'ok' });
        }
        else if (action.type === 'update_project_values') {
          await base44.entities.LiquidityProject.update(action.projectId, action.updateData);
          results.push({ label: action.label, status: 'ok' });
        }
        else if (action.type === 'upsert_billing_plan') {
          // Try to find existing plan for this month
          const existing = await base44.entities.MonthlyBillingPlan.filter({
            project_id: action.projectId,
            planning_month: action.planData.planning_month,
          });
          if (existing && existing.length > 0) {
            await base44.entities.MonthlyBillingPlan.update(existing[0].id, action.planData);
          } else {
            await base44.entities.MonthlyBillingPlan.create(action.planData);
          }
          results.push({ label: action.label, status: 'ok' });
        }
      } catch (e) {
        results.push({ label: action.label, status: 'error', note: e.message });
      }
    }

    // Update session
    if (session) {
      await base44.entities.MasterImportSession.update(session.id, {
        status: results.some(r => r.status === 'error') ? 'partially_imported' : 'imported',
        projects_created: plan.filter(a => a.type === 'create_project').length,
        projects_matched: plan.filter(a => a.type === 'update_project_values').length,
      });
    }

    setLog(results);
    setDone(true);
    setApplying(false);
    onComplete(results);
  }

  if (done) {
    const ok = log.filter(r => r.status === 'ok');
    const err = log.filter(r => r.status === 'error');
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Reset abgeschlossen</h2>
        <div className="flex gap-4 text-sm">
          <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {ok.length} OK</span>
          {err.length > 0 && <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {err.length} Fehler</span>}
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {log.map((r, i) => (
            <div key={i} className={`flex items-center gap-2 p-2 rounded text-xs border ${r.status === 'ok' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <span className="flex-1">{r.label}</span>
              {r.note && <span className="text-muted-foreground">{r.note}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const archiveCount = plan.filter(a => a.type === 'archive_project').length;
  const activateCount = plan.filter(a => a.type === 'activate_project').length;
  const createCount = plan.filter(a => a.type === 'create_project').length;
  const updateCount = plan.filter(a => a.type === 'update_project_values').length;
  const planCount = plan.filter(a => a.type === 'upsert_billing_plan').length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 7: Aktionen ausführen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Alle Änderungen werden erst nach expliziter Bestätigung ausgeführt. Archivierte Projekte werden nicht gelöscht.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">Keine Datensätze werden gelöscht.</p>
          <p className="mt-1">Archivierte Projekte erhalten <code>is_active_for_billing = false</code> und <code>excluded_from_project_cockpit = true</code>. Sie bleiben in der Datenbank und in Admin-Ansichten sichtbar.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
        {[
          { label: 'Archiviert', value: archiveCount, color: 'text-amber-600' },
          { label: 'Aktiviert', value: activateCount, color: 'text-emerald-600' },
          { label: 'Neu angelegt', value: createCount, color: 'text-blue-600' },
          { label: 'Werte aktualisiert', value: updateCount, color: 'text-primary' },
          { label: 'Abrechnungspläne', value: planCount, color: 'text-purple-600' },
        ].map(k => (
          <div key={k.label} className="border rounded-xl p-3">
            <p className={`text-2xl font-bold ${k.color}`}>{k.value}</p>
            <p className="text-xs text-muted-foreground">{k.label}</p>
          </div>
        ))}
      </div>

      <div className="space-y-1 max-h-64 overflow-y-auto border rounded-xl p-3">
        {plan.map((a, i) => (
          <div key={i} className="flex items-center gap-2 text-xs py-1">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              a.type === 'archive_project' ? 'bg-amber-400' :
              a.type === 'activate_project' ? 'bg-emerald-500' :
              a.type === 'create_project' ? 'bg-blue-500' :
              a.type === 'update_project_values' ? 'bg-primary' :
              'bg-purple-500'}`} />
            <span className="flex-1">{a.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="rounded" />
          Ich bestätige: {plan.length} Aktionen ausführen. Keine Datensätze werden gelöscht.
        </label>
      </div>

      <Button disabled={!confirmed || applying} onClick={applyAll} className="gap-2">
        {applying ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird ausgeführt…</> : <><Play className="w-4 h-4" /> {plan.length} Aktionen ausführen</>}
      </Button>
    </div>
  );
}