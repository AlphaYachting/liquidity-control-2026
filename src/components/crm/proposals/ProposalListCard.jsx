import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, Mail, Zap, User2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import moment from 'moment';

// Eine Angebots-Karte in der Studio-Liste — Typ-Symbol, Titel, Kunde, Status, Zeit.
export default function ProposalListCard({ entry }) {
  const isEmail = entry.typeKey === 'email';
  const Icon = isEmail ? Mail : FileText;

  const relative = entry.updated
    ? formatDistanceToNow(new Date(entry.updated), { addSuffix: true, locale: de })
    : null;

  return (
    <Link to={entry.href}
      className="group border rounded-xl bg-card p-4 hover:shadow-md hover:border-primary/40 transition-all block">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${entry.typeChip}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm leading-snug truncate group-hover:text-primary transition-colors" title={entry.title}>
              {entry.title}
            </p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${entry.statusColor}`}>
              {entry.statusLabel}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1 truncate">
            <User2 className="w-3 h-3 flex-shrink-0" />
            {entry.customer || 'Kein Kunde hinterlegt'}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-border/60 text-[10px]">
        <span className={`px-1.5 py-0.5 rounded font-medium ${entry.typeChip}`}>{entry.typeLabel}</span>
        {entry.sprint && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-0.5">
            <Zap className="w-2.5 h-2.5" /> Sprint
          </span>
        )}
        <span className="ml-auto text-muted-foreground" title={moment(entry.updated).format('DD.MM.YYYY HH:mm')}>
          {relative}
        </span>
      </div>
    </Link>
  );
}