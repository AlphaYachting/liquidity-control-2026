import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { ohneArchiv } from '@/lib/sprint/aktivFilter';
import { Titel, KARTE } from '@/components/sprint/heute/MeinTagBausteine';

export const SUPPORT_TICKETS_KEY = ['meinTagSupportTickets'];

const seit = (iso) => {
  const std = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 3600000));
  if (std < 24) return `seit ${std} Std.`;
  const tage = Math.round(std / 24);
  return `seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
};

function Zeile({ t, zusatz, onOeffnen, onUebernehmen }) {
  return (
    <div className="flex items-center gap-2 py-2 px-2 -mx-2 rounded border-b border-border last:border-0 hover:bg-muted">
      <button type="button" onClick={() => onOeffnen(t)} className="flex-1 min-w-0 text-left">
        <span className="block text-sm font-semibold truncate" style={{ color: RITTLER.black }}>{t.customer_name || 'Kunde unbekannt'}</span>
        <span className="block text-[12.5px] truncate" style={{ color: RITTLER.textSecondary }}>
          {t.title} · {seit(t.created_date)}{zusatz ? ` · ${zusatz}` : ''}
        </span>
      </button>
      {onUebernehmen && (
        <button type="button" onClick={() => onUebernehmen(t)} className="shrink-0 text-xs font-semibold underline" style={{ color: RITTLER.black }}>
          Übernehmen
        </button>
      )}
    </div>
  );
}

// Offene Support-Tickets: ohne Zuständigen zuerst, dann meine; Führung zusätzlich „Bei anderen".
export default function MeinTagSupportTickets({ email, istFuehrung, members = [], onOeffnen, onUebernommen }) {
  const queryClient = useQueryClient();
  const [andereOffen, setAndereOffen] = useState(false);
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: SUPPORT_TICKETS_KEY,
    queryFn: () => base44.entities.Ticket.filter(ohneArchiv({ origin: 'support', status: { $ne: 'erledigt' } }), 'created_date', 200),
    staleTime: 60 * 1000,
  });
  if (isLoading) return null;

  const ohne = tickets.filter((t) => !t.assignee_email);
  const meine = tickets.filter((t) => t.assignee_email === email);
  const andere = istFuehrung ? tickets.filter((t) => t.assignee_email && t.assignee_email !== email) : [];
  const name = (mail) => members.find((m) => m.email === mail)?.name || mail;

  const uebernehmen = async (t) => {
    await base44.entities.Ticket.update(t.id, { assignee_email: email });
    queryClient.invalidateQueries({ queryKey: SUPPORT_TICKETS_KEY });
    onUebernommen?.();
  };

  const gruppe = (titel, liste, props = {}) => liste.length > 0 && (
    <div className="mt-2">
      <p className="text-[11px] font-bold uppercase tracking-[1px]" style={{ color: RITTLER.textSecondary }}>{titel} ({liste.length})</p>
      {liste.map((t) => <Zeile key={t.id} t={t} onOeffnen={onOeffnen} {...props} />)}
    </div>
  );
  const Icon = andereOffen ? ChevronDown : ChevronRight;

  return (
    <div className={KARTE}>
      <Titel className="mb-1">Offene Support-Tickets ({ohne.length + meine.length + andere.length})</Titel>
      {ohne.length + meine.length + andere.length === 0 && (
        <p className="text-[12.5px]" style={{ color: RITTLER.textSecondary }}>Keine offenen Support-Tickets.</p>
      )}
      {gruppe('Ohne Zuständigen', ohne, { onUebernehmen: uebernehmen })}
      {gruppe('Meine', meine)}
      {andere.length > 0 && (
        <div className="mt-2">
          <button type="button" onClick={() => setAndereOffen((o) => !o)} className="flex items-center gap-1 text-[11px] font-bold uppercase tracking-[1px]" style={{ color: RITTLER.textSecondary }}>
            <Icon className="w-3.5 h-3.5" /> Bei anderen ({andere.length})
          </button>
          {andereOffen && andere.map((t) => <Zeile key={t.id} t={t} zusatz={name(t.assignee_email)} onOeffnen={onOeffnen} />)}
        </div>
      )}
    </div>
  );
}