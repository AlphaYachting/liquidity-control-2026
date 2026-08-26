import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import IntelligenzListe from '@/components/intelligence/IntelligenzListe';

const eur = (v) => `€${Math.round(v || 0).toLocaleString('de-AT')}`;

// Die Geldsicht der Projektintelligenz — bewusst eingeklappt,
// damit die Handlungen oben die Aufmerksamkeit bekommen.
export default function FinanzAuswertungBlock({ daten, onOpen }) {
  const [offen, setOffen] = useState(false);
  const basis = [
    { label: 'Kunde', get: r => r.customer },
    { label: 'Projekt', get: r => r.project_name },
  ];
  const anzahl = (daten.abrechnung?.length || 0) + (daten.budget?.length || 0) + (daten.planwertFehlt?.length || 0);

  return (
    <section className="rounded-xl border bg-card">
      <button
        onClick={() => setOffen(!offen)}
        className="w-full px-4 py-3 flex items-center gap-2 text-left"
      >
        {offen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        <h2 className="text-sm font-semibold uppercase tracking-wide">Finanzielle Auswertung</h2>
        <span className="text-xs text-muted-foreground">({anzahl})</span>
        <span className="text-xs text-muted-foreground ml-2">Budget, Abrechnungslücke, Planwerte</span>
      </button>

      {offen && (
        <div className="p-4 pt-0 space-y-4">
          <IntelligenzListe
            compact
            title="Abrechnung hinkt hinter dem Fortschritt"
            rows={daten.abrechnung || []}
            onOpen={onOpen}
            columns={[
              ...basis,
              { label: 'Fortschritt', align: 'right', get: r => `${r.fortschritt_pct}%` },
              { label: 'Abgerechnet', align: 'right', get: r => `${r.abrechnung_pct}%` },
              { label: 'Offen netto', align: 'right', get: r => eur(r.open_amount_net) },
            ]}
          />
          <IntelligenzListe
            compact
            title="Budget reisst"
            rows={daten.budget || []}
            onOpen={onOpen}
            columns={[
              ...basis,
              { label: 'Auslastung', align: 'right', get: r => `${r.auslastung_pct}%` },
              { label: 'Aufgabenfortschritt', align: 'right', get: r => r.aufgaben_pct === null ? '—' : `${r.aufgaben_pct}%` },
              { label: 'Offen netto', align: 'right', get: r => eur(r.open_amount_net) },
            ]}
          />
          <IntelligenzListe
            compact
            title="Planwert nicht gepflegt"
            hint="Keine Budget-Ampel möglich"
            rows={daten.planwertFehlt || []}
            onOpen={onOpen}
            columns={[
              ...basis,
              { label: 'Planqualität', get: r => r.planqualitaet },
              { label: 'Stunden gebucht', align: 'right', get: r => r.gebuchte_stunden },
              { label: 'Offen netto', align: 'right', get: r => eur(r.open_amount_net) },
            ]}
          />
        </div>
      )}
    </section>
  );
}