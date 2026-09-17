import React, { useState, useEffect } from 'react';
import { Box, BoxKopf, BoxInhalt } from '@/components/shared/Box';
import IntelligenzListe from '@/components/intelligence/IntelligenzListe';

const eur = (v) => `€${Math.round(v || 0).toLocaleString('de-AT')}`;

// Die Geldsicht der Projektintelligenz — bewusst eingeklappt,
// damit die Handlungen oben die Aufmerksamkeit bekommen.
export default function FinanzAuswertungBlock({ daten = {}, onOpen, offenErzwingen }) {
  const [offen, setOffen] = useState(false);
  useEffect(() => { if (offenErzwingen) setOffen(true); }, [offenErzwingen]);

  const a = daten.abrechnung?.length || 0;
  const b = daten.budget?.length || 0;
  const c = daten.planwertFehlt?.length || 0;

  return (
    <div id="finanzauswertung">
      <Box>
        <BoxKopf
          titel="Finanzielle Auswertung"
          hinweis={`Abrechnung hinkt ${a} · Budget reißt ${b} · Planwert fehlt ${c}`}
          einklappbar
          offen={offen}
          onToggle={() => setOffen((o) => !o)}
        />
        {offen && (
          <BoxInhalt className="space-y-5">
            <IntelligenzListe
              eingebettet
              title="Abrechnung hinkt hinter dem Fortschritt"
              rows={daten.abrechnung || []}
              onOpen={onOpen}
              ton="attention"
              zeile={(r) => ({
                label: r.project_name,
                zusatz: `Fortschritt ${r.fortschritt_pct} % · abgerechnet ${r.abrechnung_pct} %`,
                wert: eur(r.open_amount_net),
                wertHinweis: 'offen netto',
              })}
            />
            <IntelligenzListe
              eingebettet
              title="Budget reißt"
              rows={daten.budget || []}
              onOpen={onOpen}
              ton="critical"
              zeile={(r) => ({
                label: r.project_name,
                zusatz: `Aufgaben ${r.aufgaben_pct ?? '—'} % · ${eur(r.open_amount_net)} offen`,
                wert: `${r.auslastung_pct} %`,
                wertHinweis: 'Auslastung',
              })}
            />
            <IntelligenzListe
              eingebettet
              title="Planwert nicht gepflegt"
              rows={daten.planwertFehlt || []}
              onOpen={onOpen}
              ton="neutral"
              zeile={(r) => ({
                label: r.project_name,
                zusatz: `${r.gebuchte_stunden} h gebucht · ${eur(r.open_amount_net)} offen`,
                wert: r.planqualitaet,
              })}
            />
          </BoxInhalt>
        )}
      </Box>
    </div>
  );
}