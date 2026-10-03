import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import ProjektBeschreibung from '@/components/sprint/uebersicht/ProjektBeschreibung';
import AworkVerlaufPanel from '@/components/sprint/uebersicht/AworkVerlaufPanel';
import { fmtEUR } from '@/components/sprint/sprintConfig';
import AuftragsumfangKarte from '@/components/projekt/AuftragsumfangKarte';
import useProjektAuftraege from '@/hooks/useProjektAuftraege';
import { fmtTag } from '@/lib/crm/abStatus';

const ersteZeile = (text) => (text || '').split('\n').map((z) => z.trim()).find(Boolean) || '';

// Projektbeschreibung — der eine Platz für „was ist in diesem Projekt inkludiert".
// Standardmäßig eingeklappt, damit die Arbeit (Etappen, Aufgaben) oben bleibt.
// Aufgeklappt: Briefing, vereinbarter Umfang laut AB, aWork-Verlauf.
// Die Projektleitung steht im Projektkopf und wird hier nicht wiederholt.
export default function ProjektUebersicht({ project, client, onChanged, ohneStatus = false, startOffen = false }) {
  const [offen, setOffen] = useState(startOffen);
  const { data: orders = [] } = useProjektAuftraege(project);
  const order = orders[0] || null;

  // Gleicher Schlüssel wie in der AB-Karte — die Positionen werden nur einmal geladen
  const { data: positionen = [] } = useQuery({
    queryKey: ['projektAbrechnung', 'umfangPositionen', order?.id],
    enabled: Boolean(order?.id),
    queryFn: () => base44.entities.ConfirmedOrderItem.filter({ confirmed_order_id: order.id }),
    select: (rows) => rows.filter((i) => !i.is_discount),
  });

  if (!project) return null;

  const kurz = order
    ? [
      order.order_number || 'Auftrag ohne Nummer',
      `${fmtEUR(order.total_net_amount)} netto`,
      positionen.length ? `${positionen.length} ${positionen.length === 1 ? 'Position' : 'Positionen'}` : null,
      order.liefertermin ? `Lieferung ${fmtTag(order.liefertermin)}` : null,
    ].filter(Boolean).join(' · ')
    : ersteZeile(project.description) || 'Noch kein Briefing erfasst';

  return (
    <section className="bg-card rounded border border-border">
      <button
        type="button"
        onClick={() => setOffen((o) => !o)}
        aria-expanded={offen}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left rounded hover:bg-muted/40"
      >
        <ChevronRight className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${offen ? 'rotate-90' : ''}`} />
        <span className="text-sm font-semibold shrink-0">Projektbeschreibung</span>
        <span className="flex-1 min-w-0 truncate text-meta text-muted-foreground">{kurz}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{offen ? 'einklappen' : 'aufklappen'}</span>
      </button>

      {offen && (
        <div className="border-t border-border px-5 pt-4 pb-5 space-y-4">
          <div>
            <p className="text-label text-muted-foreground mb-1">Briefing</p>
            <ProjektBeschreibung project={project} onSaved={onChanged} />
          </div>

          {orders.map((o) => <AuftragsumfangKarte key={o.id} order={o} ohneStatus={ohneStatus} />)}

          <AworkVerlaufPanel clientName={client?.name} projectTitle={project.title} />
        </div>
      )}
    </section>
  );
}
