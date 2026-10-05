import React from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, ExternalLink, Clock, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supportVerrechnungsMinuten } from '@/lib/zeit/rundung';

const std = (min) => ((Number(min) || 0) / 60).toFixed(2);

// Ein erledigtes App-Ticket (oder „Zeit ohne Ticket") als eigene Rechnungsposition
export default function SupportAppLine({ task, abrechenbar, darfAendern, onInvoice, onNichtVerrechnen, onAworkZeit }) {
  const ohneZeit = task.ohne_zeit;
  return (
    <div className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-background">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs font-medium truncate">{task.task_title}</p>
          {ohneZeit && <Badge className="bg-amber-100 text-amber-800 flex-shrink-0">keine Zeit gebucht</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {task.assignee_name || '—'}
          {task.erledigt_am ? ` · erledigt ${new Date(task.erledigt_am).toLocaleDateString('de-AT')}` : ` · letzte Buchung ${task.last_entry_date || '—'}`}
          {ohneZeit
            ? (task.target_hours ? ` · Plan ${task.target_hours} h` : '')
            : ` · gebucht ${std(task.open_minutes)} h · verrechnet ${std(supportVerrechnungsMinuten(task.open_minutes))} h`}
          {task.vorleistung_minutes > 0 && ` · davon aus aWork ${std(task.vorleistung_minutes)} h`}
        </p>
      </div>
      {task.link && (
        <Link to={task.link} title="Ticket öffnen" className="flex-shrink-0 text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      )}
      {darfAendern && task.ticket_id && (
        <>
          <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => onAworkZeit(task)} title="Zeit aus aWork übernehmen">
            <Clock className="w-3.5 h-3.5" /> {task.awork_task_id ? 'aWork-Zeit' : 'aWork-Zeit zuordnen'}
          </Button>
          <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => onNichtVerrechnen(task)}>
            <Ban className="w-3.5 h-3.5" /> Nicht verrechnen
          </Button>
        </>
      )}
      <Button size="sm" variant="outline" className="flex-shrink-0" onClick={() => onInvoice(task)} disabled={!abrechenbar}>
        <FilePlus2 className="w-3.5 h-3.5" /> Einzelrechnung
      </Button>
    </div>
  );
}
