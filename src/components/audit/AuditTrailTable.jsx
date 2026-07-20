import React from 'react';

const ACTION_STYLES = {
  create: 'bg-emerald-100 text-emerald-700',
  update: 'bg-blue-100 text-blue-700',
  delete: 'bg-red-100 text-red-700',
  import: 'bg-violet-100 text-violet-700',
  status_change: 'bg-amber-100 text-amber-700',
  scenario_run: 'bg-sky-100 text-sky-700',
  export: 'bg-slate-100 text-slate-700',
};

const ACTION_LABELS = {
  create: 'Erstellt',
  update: 'Geändert',
  delete: 'Gelöscht',
  import: 'Import',
  status_change: 'Statuswechsel',
  scenario_run: 'Szenario',
  export: 'Export',
};

export default function AuditTrailTable({ logs }) {
  if (!logs.length) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Keine Einträge gefunden.</p>;
  }
  return (
    <div className="border rounded-xl bg-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th className="px-3 py-2 font-medium">Zeitpunkt</th>
            <th className="px-3 py-2 font-medium">Benutzer</th>
            <th className="px-3 py-2 font-medium">Aktion</th>
            <th className="px-3 py-2 font-medium">Datentyp</th>
            <th className="px-3 py-2 font-medium">Details</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr key={log.id} className="border-b last:border-0 hover:bg-muted/40 align-top">
              <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                {log.created_date ? new Date(log.created_date).toLocaleString('de-AT') : '—'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-medium">{log.user_email || '—'}</td>
              <td className="px-3 py-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ACTION_STYLES[log.action] || 'bg-muted text-muted-foreground'}`}>
                  {ACTION_LABELS[log.action] || log.action}
                </span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{log.entity_type}</td>
              <td className="px-3 py-2 max-w-md">
                <span className="text-xs text-muted-foreground break-all line-clamp-2">
                  {log.details || log.new_value || log.entity_id || '—'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}