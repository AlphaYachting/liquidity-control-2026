import React from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { Building2, CalendarClock } from 'lucide-react';
import { SOURCE_LABELS, eur } from '@/components/crm/stages';

export default function DealCard({ deal, onClick }) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const ageDays = deal.created_date ? differenceInDays(today, parseISO(deal.created_date)) : 0;
  const nextOverdue = deal.next_step_date && deal.next_step_date < todayStr;

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-card border rounded-lg p-3 shadow-sm hover:shadow-md hover:border-primary/40 transition-all space-y-1.5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight">
          {!deal.seen_at && (
            <span className="inline-block align-middle mr-1.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold uppercase tracking-wide">
              Neu
            </span>
          )}
          {deal.title}
        </p>
        {deal.value_net > 0 && (
          <span className="text-xs font-bold text-foreground shrink-0">{eur(deal.value_net)}</span>
        )}
      </div>
      {deal.company_name && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <Building2 className="w-3 h-3 shrink-0" /> {deal.company_name}
        </p>
      )}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[11px] text-muted-foreground">{SOURCE_LABELS[deal.source] || deal.source}</span>
        <span className="text-[11px] text-muted-foreground">{ageDays} Tage</span>
      </div>
      {deal.next_step && (
        <p className={`text-[11px] flex items-center gap-1 rounded-md px-1.5 py-1 ${
          nextOverdue ? 'bg-red-50 text-red-700 font-medium' : 'bg-muted text-muted-foreground'
        }`}>
          <CalendarClock className="w-3 h-3 shrink-0" />
          <span className="truncate">{deal.next_step}</span>
          {deal.next_step_date && <span className="shrink-0">· {new Date(deal.next_step_date).toLocaleDateString('de-AT')}</span>}
        </p>
      )}
    </button>
  );
}