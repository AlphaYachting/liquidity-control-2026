import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import ZahlSpalte from './ZahlSpalte';
import { budgetSpalte, terminSpalte, warnZeile } from '@/lib/zeit/projektAmpel';

// Zwei Zahlen statt zwei Karten — die beiden Prozentwerte lesen sich gegeneinander.
export default function ZahlenBlock({ kontext }) {
  const links = budgetSpalte(kontext?.budget, kontext?.kategorie, kontext?.project?.stundensatz);
  const rechts = terminSpalte(kontext?.summen?.sprint_start_date, kontext?.summen?.sprint_delivery_date);
  const warnung = warnZeile({
    frist: kontext?.summen?.frist,
    budgetAnteil: links.anteil,
    laufzeitAnteil: rechts.anteil,
  });

  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${RITTLER.line}` }}>
      <div className="grid grid-cols-2 gap-3">
        <ZahlSpalte daten={links} />
        <div className="pl-3" style={{ borderLeft: `1.5px solid ${RITTLER.line}` }}>
          <ZahlSpalte daten={rechts} />
        </div>
      </div>
      {warnung && (
        <p className="flex items-start gap-1.5 text-[11.5px] mt-3" style={{ color: warnung.farbe }}>
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{warnung.text}</span>
        </p>
      )}
    </div>
  );
}