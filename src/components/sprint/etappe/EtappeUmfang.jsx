import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import useProjektAuftraege from '@/hooks/useProjektAuftraege';
import { fmtEUR } from '@/components/sprint/sprintConfig';

const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();

// Welche AB-Position gehört zu dieser Etappe? Zuerst gleicher Titel, dann „Position N“
// im Titel, zuletzt die Reihenfolge — wenn AB und Sprint gleich viele Positionen haben.
export function positionZuEtappe(positionen, milestone, anzahlEtappen) {
  if (!positionen.length || !milestone) return null;
  const titel = norm(milestone.title);
  const gleich = positionen.find((p) => norm(p.title) === titel);
  if (gleich) return gleich;
  const nr = /^position\s+(\d+)/i.exec(milestone.title || '')?.[1];
  if (nr) {
    const perNr = positionen.find((p) => Number(p.position) === Number(nr));
    if (perNr) return perNr;
  }
  if (positionen.length === anzahlEtappen) {
    return positionen.find((p) => Number(p.position) === Number(milestone.order)) || null;
  }
  return null;
}

// „Umfang laut AB“ — was der Kunde für genau diese Etappe beauftragt hat. Eingeklappt.
export default function EtappeUmfang({ project, sprint, milestone, anzahlEtappen }) {
  const [offen, setOffen] = useState(false);
  const { data: orders = [] } = useProjektAuftraege(project);
  const order = orders[0] || null;

  // Gleicher Schlüssel wie Projektbeschreibung und AB-Karte — nur einmal geladen
  const { data: positionen = [] } = useQuery({
    queryKey: ['projektAbrechnung', 'umfangPositionen', order?.id],
    enabled: Boolean(order?.id),
    queryFn: () => base44.entities.ConfirmedOrderItem.filter({ confirmed_order_id: order.id }),
    select: (rows) => rows.filter((i) => !i.is_discount),
  });

  const pos = positionZuEtappe(positionen, milestone, anzahlEtappen);
  if (!pos) return null;

  const leistungen = (pos.lieferumfang || []).filter((z) => (z || '').trim());
  const schleifen = Number(pos.korrekturschleifen) || 0;
  const kurz = [
    pos.position ? `Position ${pos.position}` : null,
    leistungen.length ? `${leistungen.length} ${leistungen.length === 1 ? 'Leistung' : 'Leistungen'}` : null,
    pos.total_price ? fmtEUR(pos.total_price) : null,
    schleifen > 0 ? `${schleifen} Korrekturschleifen` : null,
    order?.order_number || null,
  ].filter(Boolean).join(' · ');

  return (
    <section className="rounded border border-border bg-card">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="flex w-full items-center gap-3 rounded px-5 py-3.5 text-left hover:bg-muted/40"
      >
        <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${offen ? 'rotate-90' : ''}`} />
        <span className="shrink-0 text-sm font-semibold">Umfang laut AB</span>
        <span className="min-w-0 flex-1 truncate text-meta text-muted-foreground">{kurz}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{offen ? 'einklappen' : 'aufklappen'}</span>
      </button>
      {offen && (
        <div className="flex flex-col gap-2.5 border-t border-[#EEEEEE] py-3.5 pb-[18px] pl-12 pr-5 text-[13px]">
          {pos.description && <p className="m-0 whitespace-pre-wrap">{pos.description}</p>}
          {leistungen.length > 0 && (
            <ul className="m-0 flex list-disc flex-col gap-[3px] pl-[18px] text-[#444444]">
              {leistungen.map((z, i) => <li key={i}>{z.replace(/^[–-]\s*/, '')}</li>)}
            </ul>
          )}
          {sprint && (
            <Link to={`/sprint/sprints/${sprint.id}?beschreibung=offen`} className="w-max text-xs text-[#555555] underline hover:text-foreground">
              Ganze AB im Projekt ansehen
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
