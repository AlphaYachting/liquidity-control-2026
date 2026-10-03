import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { fmtEUR } from '@/components/sprint/sprintConfig';
import { ABRECHNUNG_LABELS, ITEM_STATUS_LABELS } from '@/lib/crm/abStatus';

// Eine Position im Auftragsumfang — aufklappbar mit Beschreibung und Lieferumfang.
// ohneStatus: bei Sprintprojekten trägt die Etappe den Stand, der Positionsstatus entfällt.
export default function UmfangPositionZeile({ item, auftragSchleifen, ohneStatus = false }) {
  const [offen, setOffen] = useState(false);
  const abweichend = item.korrekturschleifen != null && item.korrekturschleifen !== auftragSchleifen;
  const details = item.description || item.lieferumfang?.length || abweichend || item.leistungszeitraum;
  return (
    <div className="border-b border-border last:border-0 py-2">
      <button type="button" disabled={!details} onClick={() => setOffen(!offen)}
        className="w-full flex items-start gap-2 text-left text-sm">
        <ChevronRight className={`w-3.5 h-3.5 mt-1 shrink-0 text-muted-foreground transition-transform ${offen ? 'rotate-90' : ''} ${details ? '' : 'invisible'}`} />
        <span className="w-6 shrink-0 text-muted-foreground">{item.position}.</span>
        <span className="flex-1 min-w-0 break-words">{item.title}</span>
        <span className="text-xs text-muted-foreground shrink-0">{ABRECHNUNG_LABELS[item.abrechnung] || 'einmalig'}</span>
        {!ohneStatus && (
          <span className="text-xs text-muted-foreground shrink-0 w-24 text-right">{ITEM_STATUS_LABELS[item.status] || ITEM_STATUS_LABELS.not_started}</span>
        )}
        <span className="font-medium shrink-0 w-24 text-right">{fmtEUR(item.total_price)}</span>
      </button>
      {offen && (
        <div className="pl-14 pr-2 pt-2 space-y-2 text-meta text-muted-foreground">
          {item.description && <p className="whitespace-pre-line">{item.description}</p>}
          {item.lieferumfang?.length > 0 && (
            <ul className="list-disc pl-4 space-y-0.5">{item.lieferumfang.map((l, i) => <li key={i}>{l}</li>)}</ul>
          )}
          {abweichend && <p>Korrekturschleifen dieser Position: <span className="text-foreground">{item.korrekturschleifen}</span></p>}
          {item.leistungszeitraum && <p>Dauer: <span className="text-foreground">{item.leistungszeitraum}</span></p>}
        </div>
      )}
    </div>
  );
}