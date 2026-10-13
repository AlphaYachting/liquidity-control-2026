import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Mail, Zap, Trash2, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { formatCurrency } from '@/lib/liquidityUtils';
import moment from 'moment';

// Eine Zeile der Angebotsliste — Typ, Titel, Kunde, Kurzinhalt, Preis, Status, Löschen.
export default function ProposalListRow({ entry, onDelete, isDeleting }) {
  const [confirm, setConfirm] = useState(false);
  const Icon = entry.typeKey === 'email' ? Mail : FileText;

  const relative = entry.updated
    ? formatDistanceToNow(new Date(entry.updated), { addSuffix: true, locale: de })
    : null;

  return (
    <div className="group border-b last:border-0 hover:bg-muted/30 transition-colors">
      <div className="flex items-start gap-3 p-3">
        <Link to={entry.href} className="flex items-start gap-3 flex-1 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${entry.typeChip}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="font-semibold text-sm leading-snug group-hover:text-primary transition-colors">
                {entry.title}
              </p>
              <span className="text-xs text-muted-foreground">{entry.customer || 'Kein Kunde hinterlegt'}</span>
            </div>
            {entry.preview && (
              <p className="text-xs text-muted-foreground leading-relaxed">{entry.preview}</p>
            )}
            <div className="flex items-center gap-2 text-[10px] flex-wrap">
              <span className={`px-1.5 py-0.5 rounded font-medium ${entry.typeChip}`}>{entry.typeLabel}</span>
              {entry.sprint && (
                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground inline-flex items-center gap-0.5">
                  <Zap className="w-2.5 h-2.5" /> Sprint
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-full font-semibold ${entry.statusColor}`}>{entry.statusLabel}</span>
              <span className="text-muted-foreground" title={moment(entry.updated).format('DD.MM.YYYY HH:mm')}>
                {relative}
              </span>
            </div>
          </div>
        </Link>

        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-sm font-semibold tabular-nums w-24 text-right">
            {entry.totalNet ? formatCurrency(entry.totalNet) : <span className="text-xs text-muted-foreground font-normal">kein Preis</span>}
          </span>
          {confirm ? (
            <span className="flex items-center gap-1">
              <button onClick={() => { onDelete(entry); setConfirm(false); }}
                className="text-xs text-white bg-destructive hover:bg-destructive/80 px-1.5 py-0.5 rounded">
                Ja
              </button>
              <button onClick={() => setConfirm(false)}
                className="text-xs border px-1.5 py-0.5 rounded hover:bg-muted">
                Nein
              </button>
            </span>
          ) : (
            <button title="Angebot löschen" disabled={isDeleting}
              onClick={() => setConfirm(true)}
              className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50">
              {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}