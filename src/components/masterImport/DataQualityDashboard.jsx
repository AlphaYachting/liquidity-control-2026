import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { FolderKanban, ClipboardList, FileText, AlertTriangle, CheckCircle2, Eye } from 'lucide-react';

function QCard({ icon: Icon, label, value, color = 'text-foreground', bg = 'bg-card' }) {
  return (
    <div className={`${bg} border rounded-xl p-4 flex items-center gap-3`}>
      <div className="p-2 rounded-lg bg-muted">
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold">{value ?? '—'}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function DataQualityDashboard() {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.LiquidityProject.list() });
  const { data: orders = [] } = useQuery({ queryKey: ['confirmedOrders'], queryFn: () => base44.entities.ConfirmedOrder.list() });
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: () => base44.entities.InvoiceRecord.list('-invoice_date', 500) });
  const { data: sessions = [] } = useQuery({ queryKey: ['importSessions'], queryFn: () => base44.entities.MasterImportSession.list('-created_date', 10) });

  const active = projects.filter(p => p.status === 'active');
  const withoutOrder = active.filter(p => !orders.some(o => o.project_id === p.id));
  const withoutInvoice = active.filter(p => !invoices.some(i => i.project_id === p.id));
  const unmatchedInvoices = invoices.filter(i => !i.project_id && !i.confirmed_order_id && i.payment_status !== 'cancelled');
  const lastSession = sessions[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Datenqualitäts-Übersicht</h3>
        {lastSession && (
          <span className="text-xs text-muted-foreground">
            Letzter Import: {new Date(lastSession.created_date).toLocaleDateString('de-AT')} · Status: {lastSession.status}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QCard icon={FolderKanban} label="Aktive Projekte" value={active.length} color="text-primary" />
        <QCard icon={ClipboardList} label="Ohne Auftragsbestätigung" value={withoutOrder.length} color={withoutOrder.length > 0 ? 'text-amber-600' : 'text-emerald-600'} />
        <QCard icon={FileText} label="Ohne Rechnungen" value={withoutInvoice.length} color={withoutInvoice.length > 0 ? 'text-amber-600' : 'text-emerald-600'} />
        <QCard icon={AlertTriangle} label="Nicht zugeordnete Rechnungen" value={unmatchedInvoices.length} color={unmatchedInvoices.length > 0 ? 'text-red-600' : 'text-emerald-600'} />
      </div>

      {sessions.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Import-Sessions</p>
          <div className="border rounded-xl overflow-hidden">
            <div className="divide-y text-sm">
              {sessions.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-muted-foreground text-xs">{new Date(s.created_date).toLocaleDateString('de-AT')}</span>
                  <span className="flex-1 font-medium truncate">{s.file_name || '—'}</span>
                  <span className="text-xs text-muted-foreground">{s.total_rows} Zeilen</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    s.status === 'imported' ? 'bg-emerald-100 text-emerald-700' :
                    s.status === 'partially_imported' ? 'bg-amber-100 text-amber-700' :
                    s.status === 'failed' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'}`}>
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}