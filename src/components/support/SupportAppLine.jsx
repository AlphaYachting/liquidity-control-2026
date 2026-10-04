import React from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supportVerrechnungsMinuten } from '@/lib/zeit/rundung';

const std = (min) => ((Number(min) || 0) / 60).toFixed(2);

// Ein erledigtes App-Ticket (oder „Zeit ohne Ticket") als eigene Rechnungsposition
export default function SupportAppLine({ task, abrechenbar, onInvoice }) {
  return (
    <div className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-background">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{task.task_title}</p>
        <p className="text-xs text-muted-foreground truncate">
          {task.assignee_name || '—'} · letzte Buchung {task.last_entry_date || '—'} · gebucht {std(task.open_minutes)} h · verrechnet {std(supportVerrechnungsMinuten(task.open_minutes))} h
          {task.vorleistung_minutes > 0 && ` · davon aus aWork übernommen ${std(task.vorleistung_minutes)} h`}
        </p>
      </div>
      {task.link && (
        <Link to={task.link} title="Ticket öffnen" className="flex-shrink-0 text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      )}
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => onInvoice(task)} disabled={!abrechenbar}>
        <FilePlus2 className="w-3.5 h-3.5" /> Einzelrechnung
      </Button>
    </div>
  );
}