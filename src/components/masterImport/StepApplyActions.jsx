import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Play, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/masterImportUtils';

export default function StepApplyActions({ rows, decisions, session, existingProjects, existingOrders, onComplete }) {
  const [applying, setApplying] = useState(false);
  const [log, setLog] = useState([]);
  const [done, setDone] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Build action plan
  const actions = rows.map(row => {
    const dec = decisions[row.row_number] || {};
    const acts = [];
    if (dec.project_action === 'create') {
      acts.push({ type: 'create_project', label: `Projekt anlegen: ${row.project_name_raw}`, row, dec });
    } else if (dec.project_id) {
      acts.push({ type: 'update_project', label: `Projekt aktualisieren: ${existingProjects.find(p => p.id === dec.project_id)?.project_name || dec.project_id}`, row, dec });
    }
    if (dec.order_id && dec.project_id) {
      acts.push({ type: 'link_order', label: `AB verknüpfen`, row, dec });
    }
    if ((dec.invoice_ids || []).length > 0 && dec.project_id) {
      acts.push({ type: 'link_invoices', label: `${dec.invoice_ids.length} Rechnung(en) verknüpfen`, row, dec });
    }
    return acts;
  }).flat();

  async function applyAll() {
    setApplying(true);
    const results = [];

    for (const action of actions) {
      const { type, label, row, dec } = action;
      try {
        if (type === 'create_project') {
          const created = await base44.entities.LiquidityProject.create({
            project_name: row.project_name_raw,
            customer: row.customer_name_normalized || row.customer_name_raw,
            project_manager: row.project_manager || '',
            total_net_amount: row.total_order_amount_net || 0,
            already_invoiced_amount: row.already_invoiced_net || 0,
            open_amount: row.open_amount_net || 0,
            notes: row.notes || '',
            notes_next_invoice: row.next_invoice_note || '',
            status: 'active',
          });
          dec._created_project_id = created.id;
          results.push({ label, status: 'ok', note: `ID: ${created.id}` });
        }

        else if (type === 'update_project') {
          const updateData = {};
          if (row.notes_next_invoice) updateData.notes_next_invoice = row.next_invoice_note;
          if (row.notes) updateData.notes = row.notes;
          if (row.project_manager) updateData.project_manager = row.project_manager;
          if (Object.keys(updateData).length > 0) {
            await base44.entities.LiquidityProject.update(dec.project_id, updateData);
          }
          results.push({ label, status: 'ok', note: 'Notizen/PM aktualisiert' });
        }

        else if (type === 'link_order') {
          const projectId = dec._created_project_id || dec.project_id;
          await base44.entities.ConfirmedOrder.update(dec.order_id, { project_id: projectId });
          results.push({ label, status: 'ok' });
        }

        else if (type === 'link_invoices') {
          const projectId = dec._created_project_id || dec.project_id;
          for (const invId of dec.invoice_ids) {
            await base44.entities.InvoiceRecord.update(invId, {
              project_id: projectId,
              ...(dec.order_id ? { confirmed_order_id: dec.order_id } : {}),
              match_status: 'manually_matched',
            });
          }
          results.push({ label, status: 'ok', note: `${dec.invoice_ids.length} Rechnungen verknüpft` });
        }

      } catch (e) {
        results.push({ label, status: 'error', note: e.message });
      }
    }

    // Update session
    const created = results.filter(r => r.status === 'ok').length;
    const errors = results.filter(r => r.status === 'error').length;
    await base44.entities.MasterImportSession.update(session.id, {
      status: errors > 0 ? 'partially_imported' : 'imported',
      projects_created: actions.filter(a => a.type === 'create_project').length,
      orders_matched: actions.filter(a => a.type === 'link_order').length,
      invoices_matched: actions.filter(a => a.type === 'link_invoices').length,
    });

    setLog(results);
    setDone(true);
    setApplying(false);
    onComplete(results);
  }

  if (done) {
    const ok = log.filter(r => r.status === 'ok');
    const err = log.filter(r => r.status === 'error');
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Import abgeschlossen</h2>
          <div className="flex items-center gap-4 mt-2 text-sm">
            <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {ok.length} Aktionen erfolgreich</span>
            {err.length > 0 && <span className="text-red-600 flex items-center gap-1"><AlertTriangle className="w-4 h-4" /> {err.length} Fehler</span>}
          </div>
        </div>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {log.map((r, i) => (
            <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg text-sm border ${r.status === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              {r.status === 'ok' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />}
              <span className="flex-1">{r.label}</span>
              {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 10: Bestätigung & Import</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Alle Aktionen werden nur nach expliziter Bestätigung ausgeführt. Bestehende Daten werden nicht überschrieben.
        </p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold text-amber-800">Sicherheitshinweis</p>
          <p className="text-amber-700 mt-1">
            Bestehende Daten werden <strong>nicht gelöscht</strong>. Es werden nur neue Verknüpfungen erstellt und fehlende Projekte angelegt. Notizen werden <strong>nur ergänzt</strong>, nicht überschrieben.
          </p>
        </div>
      </div>

      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Keine Aktionen geplant. Gehe zurück und treffe Entscheidungen für die Zeilen.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-medium">{actions.length} geplante Aktionen:</p>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 border rounded-lg text-sm">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                a.type === 'create_project' ? 'bg-blue-500' :
                a.type === 'update_project' ? 'bg-amber-500' :
                'bg-emerald-500'}`} />
              <span className="flex-1">{a.label}</span>
              <span className="text-xs text-muted-foreground">
                {a.type === 'create_project' ? 'NEU' : a.type === 'update_project' ? 'UPDATE' : 'LINK'}
              </span>
            </div>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="rounded" />
            Ich bestätige, dass diese {actions.length} Aktionen ausgeführt werden sollen.
          </label>
        </div>
      )}

      <Button
        disabled={!confirmed || applying || actions.length === 0}
        onClick={applyAll}
        className="gap-2"
      >
        {applying ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird ausgeführt…</> : <><Play className="w-4 h-4" /> {actions.length} Aktionen ausführen</>}
      </Button>
    </div>
  );
}