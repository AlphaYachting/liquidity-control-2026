import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { useZugriff } from '@/lib/useZugriff';
import { ladeAuslastung } from '@/lib/auslastung/auslastungDaten';
import { berechne, fmtH } from '@/lib/auslastung/auslastungRechnung';
import AuslastungFilter from '@/components/auslastung/AuslastungFilter';
import AuslastungKennzahlen from '@/components/auslastung/AuslastungKennzahlen';
import PersonZeile from '@/components/auslastung/PersonZeile';

const SPALTEN = ['Person', 'Offene Tickets', 'Geschätzt', 'Ohne Schätzung', 'Hochrechnung', 'Projekte', 'Gebunden bis', 'Routinen', 'Support'];

export default function Auslastungsforecast() {
  const { istAdmin } = useZugriff();
  const [pauschal, setPauschal] = useState(2);
  const [rolle, setRolle] = useState('alle');
  const [typ, setTyp] = useState('alle');
  const [offen, setOffen] = useState(null);
  const [zeigePausiert, setZeigePausiert] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['auslastungsforecast'], queryFn: ladeAuslastung, enabled: istAdmin });
  const ergebnis = useMemo(() => (data ? berechne(data, { pauschal, rolle, typ }) : null), [data, pauschal, rolle, typ]);

  if (!istAdmin) return null;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Auslastungsforecast</h1>
      <AuslastungFilter {...{ pauschal, setPauschal, rolle, setRolle, typ, setTyp }} />
      {isLoading || !ergebnis ? <Skeleton className="h-64 w-full" /> : (
        <>
          <AuslastungKennzahlen gesamt={ergebnis.gesamt} />
          <div className="bg-white rounded border border-border overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-border">
                {SPALTEN.map((s) => <th key={s} className="text-left text-label uppercase text-muted-foreground font-medium px-3 py-2">{s}</th>)}
              </tr></thead>
              <tbody>
                {ergebnis.zeilen.map((p) => (
                  <PersonZeile key={p.key} person={p} offen={offen === p.key} onToggle={() => setOffen(offen === p.key ? null : p.key)} />
                ))}
              </tbody>
            </table>
          </div>
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