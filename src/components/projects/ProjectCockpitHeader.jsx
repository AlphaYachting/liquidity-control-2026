import React from 'react';
import { ArrowLeft, FolderKanban, Trash2, Archive, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/components/shared/StatusBadge';
import CommunicationStatusBadge from '@/components/crm/emails/CommunicationStatusBadge';

export default function ProjectCockpitHeader({ project, embedded, onBack, onUpdate, onDelete }) {
  const isArchived = project.billing_relevance_status === 'archived' || project.excluded_from_project_cockpit;

  return (
    <div className="bg-card border rounded-xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        {/* Links: Zurück + Icon + Titel */}
        <div className="flex items-start gap-3 min-w-0">
          {!embedded && (
            <Button variant="ghost" size="icon" className="flex-shrink-0 mt-0.5" onClick={onBack}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
            <FolderKanban className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold leading-snug">{project.project_name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{project.customer} · Projekt-Cockpit</p>
          </div>
        </div>

        {/* Rechts: Aktionen */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {isArchived ? (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-emerald-700 hover:bg-emerald-50"
              onClick={() => onUpdate({
                billing_relevance_status: 'active_billing_relevant',
                excluded_from_project_cockpit: false,
                archived_at: null, archive_source: null, archived_by: null,
              })}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reaktivieren
            </Button>
          ) : (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-amber-700 hover:bg-amber-50"
              onClick={() => onUpdate({
                billing_relevance_status: 'archived', excluded_from_project_cockpit: true,
                archived_at: new Date().toISOString(), archive_source: 'manual',
              }, { close: true })}>
              <Archive className="w-3.5 h-3.5 mr-1" />
              Archivieren
            </Button>
          )}
          {!embedded && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-destructive hover:bg-destructive/10"
              onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />
              Löschen
            </Button>
          )}
        </div>
      </div>

      {/* Untere Zeile: Status-Badges */}
      <div className={`flex items-center gap-2 flex-wrap mt-3 ${!embedded ? 'pl-[52px]' : ''}`}>
        <StatusBadge status={project.status} />
        <CommunicationStatusBadge customer={project.customer} />
        <select
          value={project.risk_status || 'none'}
          onChange={e => onUpdate({ risk_status: e.target.value })}
          className={`text-xs rounded-md px-2 py-1 border cursor-pointer font-medium ${
            project.risk_status === 'critical' ? 'bg-red-100 text-red-800 border-red-300' :
            project.risk_status === 'high' ? 'bg-orange-100 text-orange-800 border-orange-300' :
            project.risk_status === 'medium' ? 'bg-amber-100 text-amber-800 border-amber-300' :
            project.risk_status === 'low' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
            'bg-muted text-muted-foreground border-border'
          }`}
        >
          <option value="none">Risiko: keines</option>
          <option value="low">Risiko: niedrig</option>
          <option value="medium">Risiko: mittel</option>
          <option value="high">Risiko: hoch</option>
          <option value="critical">Risiko: kritisch</option>
        </select>
      </div>
    </div>
  );
}