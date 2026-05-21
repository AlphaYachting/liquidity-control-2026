import React from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, Link2, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';

/**
 * Generic awork status bar.
 * Accepts either an `order` prop (legacy) or a `data` prop with the same shape.
 */
export default function AworkStatusBar({ order, data, onSelectProject, onSync, isSyncing }) {
  const src = data || order || {};

  const lastSync = src.awork_last_synced_at
    ? formatDistanceToNow(new Date(src.awork_last_synced_at), { addSuffix: true, locale: de })
    : null;

  const statusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s.includes('abgeschlossen') || s.includes('completed') || s.includes('done')) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (s.includes('aktiv') || s.includes('progress')) return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-gray-100 text-gray-600 border-gray-200';
  };

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">a</span>
        </div>
        <span className="text-sm font-medium text-blue-800">awork</span>
      </div>

      {src.awork_project_id ? (
        <>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm font-medium text-blue-900 truncate">{src.awork_project_name}</span>
            {src.awork_project_status && (
              <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor(src.awork_project_status)}`}>
                {src.awork_project_status}
              </span>
            )}
            {src.awork_progress_percent > 0 && (
              <span className="text-xs text-blue-700">{src.awork_progress_percent}%</span>
            )}
          </div>
          {lastSync && (
            <span className="text-xs text-blue-600 flex-shrink-0">Sync: {lastSync}</span>
          )}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={onSync} disabled={isSyncing}
              className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100">
              {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Sync
            </Button>
            <Button size="sm" variant="ghost" onClick={onSelectProject}
              className="h-7 text-xs text-blue-700 hover:bg-blue-100">
              <Link2 className="w-3 h-3 mr-1" /> Ändern
            </Button>
          </div>
        </>
      ) : (
        <>
          <span className="text-sm text-blue-700 flex-1">Kein awork Projekt verknüpft</span>
          <Button size="sm" onClick={onSelectProject}
            className="h-7 text-xs bg-blue-600 hover:bg-blue-700 text-white">
            <Link2 className="w-3 h-3 mr-1" /> Projekt verknüpfen
          </Button>
        </>
      )}
    </div>
  );
}