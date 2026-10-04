import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { useAuth } from '@/lib/AuthContext';
import { istInhaber } from '@/lib/auslastung/inhaber';
import { ladeAuslastung } from '@/lib/auslastung/auslastungDaten';
import { ladeHistorie } from '@/lib/auslastung/historieDaten';
import { berechne, fmtH } from '@/lib/auslastung/auslastungRechnung';
import { rueckblick } from '@/lib/auslastung/rueckblick';
import { vorschau as rechneVorschau, offenJeArt } from '@/lib/auslastung/vorschau';
import { ARTEN } from '@/lib/auslastung/arbeitsart';
import AuslastungFilter from '@/components/auslastung/AuslastungFilter';
import AuslastungKennzahlen from '@/components/auslastung/AuslastungKennzahlen';
import PersonZeile from '@/components/auslastung/PersonZeile';
import VorschauDiagramm from '@/components/auslastung/VorschauDiagramm';
import VorschauSaetze from '@/components/auslastung/VorschauSaetze';
import BudgetVerbraucht from '@/components/auslastung/BudgetVerbraucht';

const SPALTEN = ['Person', 'Offene Tickets', 'Plan', 'Bereits geleistet', 'Rest', 'Ohne Schätzung', 'Hochrechnung', 'Projekte', 'Gebunden bis', 'Routinen', 'Support',
  ...ARTEN.map((a) => a.label), 'Nicht zuordenbar'];

export default function Auslastungsforecast() {
  const { user } = useAuth();
  const darf = istInhaber(user);
  const [pauschal, setPauschal] = useState(0);
  const [rolle, setRolle] = useState('alle');
  const [typ, setTyp] = useState('alle');
  const [offen, setOffen] = useState(null);
  const [zeigePausiert, setZeigePausiert] = useState(false);
  const [neu, setNeu] = useState(0);

  const { data, isLoading } = useQuery({ queryKey: ['auslastungsforecast'], queryFn: ladeAuslastung, enabled: darf });
  const { data: hist, isLoading: ladeHist } = useQuery({ queryKey: ['auslastungsforecast-historie'], queryFn: ladeHistorie, enabled: darf, staleTime: 10 * 60 * 1000 });
  const ergebnis = useMemo(() => (data ? berechne(data, { pauschal, rolle, typ }) : null), [data, pauschal, rolle, typ]);
  // Rückblick und offene Stunden je Arbeitsart nur einmal je geladenem Datenstand
  const rb = useMemo(() => (data && hist ? rueckblick(data, hist) : null), [data, hist]);
  const offenArt = useMemo(() => (data ? offenJeArt(data) : null), [data]);
  const vs = useMemo(() => (rb && offenArt ? rechneVorschau(data, rb, offenArt, { pauschal, neu }) : null), [data, rb, offenArt, pauschal, neu]);

  if (!darf) return null;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Auslastungsforecast</h1>
      <AuslastungFilter {...{ pauschal, setPauschal, rolle, setRolle, typ, setTyp }} />
      {isLoading || ladeHist || !ergebnis || !vs ? <Skeleton className="h-64 w-full" /> : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-meta text-muted-foreground">Neue Fixprojekte pro Monat in Stunden</span>
            <Slider className="w-56" min={0} max={300} step={10} value={[neu]} onValueChange={([v]) => setNeu(v)} />
            <span className="text-value">{fmtH(neu)} h</span>
          </div>
          <VorschauDiagramm vorschau={vs} />
          <VorschauSaetze vorschau={vs} rb={rb} />
          <AuslastungKennzahlen gesamt={ergebnis.gesamt} />
          <div className="bg-white rounded border border-border overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border">
                {SPALTEN.map((s) => <th key={s} className="text-left text-label uppercase text-muted-foreground font-medium px-3 py-2">{s}</th>)}
              </tr></thead>
              <tbody>
                {ergebnis.zeilen.map((p) => (
                  <PersonZeile key={p.key} person={p} offen={offen === p.key} onToggle={() => setOffen(offen === p.key ? null : p.key)}
                    arten={offenArt[p.key]} schnitt={rb.personen[p.key]?.avg} />
                ))}
              </tbody>
            </table>
          </div>
          <BudgetVerbraucht liste={ergebnis.verbraucht} />
          <div className="text-meta text-muted-foreground">
            <button type="button" className="hover:underline" onClick={() => setZeigePausiert(!zeigePausiert)}>
              {zeigePausiert ? 'Pausierte Projekte ausblenden' : 'Pausierte Projekte anzeigen'}
            </button>
            {zeigePausiert && (
              <span className="ml-3">
                Pausiert: {ergebnis.pausiert.tickets} Tickets · {fmtH(ergebnis.pausiert.rest)} h geschätzt · {ergebnis.pausiert.ohne} ohne Schätzung · Hochrechnung {fmtH(ergebnis.pausiert.hoch)} h
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}