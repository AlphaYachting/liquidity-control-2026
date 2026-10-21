import React from 'react';
import { Link } from 'react-router-dom';
import { FilePlus2, ExternalLink, Clock, Ban, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supportVerrechnungsMinuten } from '@/lib/zeit/rundung';

const std = (min) => ((Number(min) || 0) / 60).toFixed(2);

// Ein erledigtes App-Ticket (oder „Zeit ohne Ticket") als eigene Rechnungsposition
export default function SupportAppLine({ task, abrechenbar, darfAendern, onInvoice, onNichtVerrechnen, onAworkZeit, onZuordnen, regie = false }) {
  const ohneZeit = task.ohne_zeit;
  // Keine verrechenbare Zeit, weil bewusst als nicht verrechenbar gebucht (21.10.2026)
  const nurNichtVerrechenbar = ohneZeit && task.nicht_verrechenbar_minutes > 0;
  const zeitOhneTicket = !task.ticket_id && !regie && (task.buchungen?.length || 0) > 0;
  // Verrechnete Stunden kommen vom Server (Support: Minimum 0,5 h je Ticket; Regie: Projektregel)
  const verrechnetMin = task.billable_minutes ?? supportVerrechnungsMinuten(task.open_minutes);
  return (
    <div className="flex items-center gap-3 border rounded-lg px-3 py-2 bg-background">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-xs font-medium truncate">{task.task_title}</p>
          {ohneZeit && !nurNichtVerrechenbar && <Badge className="bg-amber-100 text-amber-800 flex-shrink-0">keine Zeit gebucht</Badge>}
          {nurNichtVerrechenbar && (
            <Badge className="bg-slate-100 text-slate-700 flex-shrink-0">
              {std(task.nicht_verrechenbar_minutes)} h als nicht verrechenbar gebucht · {(task.nicht_verrechenbar_gruende || []).join(', ')}
            </Badge>
          )}
          {zeitOhneTicket && <Badge className="bg-amber-100 text-amber-800 flex-shrink-0">ohne Ticket — eigenes Minimum</Badge>}
          {task.vorbehalt && <Badge className="bg-amber-100 text-amber-800 flex-shrink-0">mit aWork abgleichen</Badge>}
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {task.assignee_name || '—'}
          {task.erledigt_am ? ` · erledigt ${new Date(task.erledigt_am).toLocaleDateString('de-AT')}` : ` · letzte Buchung ${task.last_entry_date || '—'}`}
          {ohneZeit
            ? (task.target_hours ? ` · Plan ${task.target_hours} h` : '')
            : ` · gebucht ${std(task.open_minutes)} h · verrechnet ${std(verrechnetMin)} h`}
          {task.vorleistung_minutes > 0 && ` · davon aus aWork ${std(task.vorleistung_minutes)} h`}
          {task.zugeordnet_minuten > 0 && ` · davon ${Math.round(task.zugeordnet_minuten)} min ohne Ticket gebucht, hier zugeordnet`}
        </p>
        {task.ohne_zeit_grund && (
          <p className="text-xs mt-0.5 text-amber-800">
            Ohne Zeit erledigt{task.ohne_zeit_von ? ` von ${task.ohne_zeit_von}` : ''}: {task.ohne_zeit_grund}{task.ohne_zeit_notiz ? ` — ${task.ohne_zeit_notiz}` : ''}
          </p>
        )}
        {/* Bemerkungen der Buchungen — was hier abgerechnet wird */}
        {task.buchungs_notizen?.length > 0 ? (
          <ul className="mt-1 space-y-0.5">
            {task.buchungs_notizen.map((n, i) => (
              <li key={i} className="text-xs">
                <span className="text-muted-foreground">
                  {n.datum ? `${n.datum.slice(8, 10)}.${n.datum.slice(5, 7)}.` : '—'}{n.person ? ` ${n.person}` : ''} · {Math.round(n.minuten)} min:
                </span>{' '}
                {n.text}
              </li>
            ))}
          </ul>
        ) : task.notizen?.length > 0 ? (
          <p className="mt-1 text-xs">{task.notizen.join(' · ')}</p>
        ) : null}
      </div>
      {task.link && (
        <Link to={task.link} title="Ticket öffnen" className="flex-shrink-0 text-muted-foreground hover:text-foreground">
          <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      )}
      {darfAendern && zeitOhneTicket && onZuordnen && (
        <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => onZuordnen(task)} title="Diese Zeit einem Ticket des Kunden zuordnen">
          <Link2 className="w-3.5 h-3.5" /> Ticket zuordnen
        </Button>
      )}
      {darfAendern && task.ticket_id && !regie && (
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
