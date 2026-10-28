import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import Seitenkopf from '@/components/shared/Seitenkopf';
import { Box, BoxKopf } from '@/components/shared/Box';
import TypPill from '@/components/sprint/TypPill';
import PersonPlanZeile from '@/components/monatsplanung/PersonPlanZeile';
import { useAuth } from '@/lib/AuthContext';
import { istInhaber } from '@/lib/auslastung/inhaber';
import { ladePlanung, ladeVerfuegbarkeit, setzeVerfuegbar } from '@/lib/monatsplanung/planDaten';
import { rechnePlan, monatsAuswahl, fmtH } from '@/lib/monatsplanung/planRechnung';

// MONATSPLANUNG (ersetzt den Auslastungsforecast, Entscheidung 28.10.2026)
// Snapshot eines Monats: wer ist verfügbar, welche Retainer liegen bei wem (Projektleitung),
// was ist im Monat fix terminiert, was liegt als Vorrat ohne Termin bereit. Keine Hochrechnung.

const knopf = (aktiv) => `text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border ${aktiv ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-border hover:bg-muted'}`;
const SPALTEN = ['Verfügbar', 'Person', 'Retainer', 'Fix im Monat', 'Gebunden', 'Vorrat ohne Termin'];

function Kennzahl({ label, wert, hinweis }) {
  return (
    <div className="bg-white rounded border border-border p-4">
      <p className="text-label uppercase text-muted-foreground">{label}</p>
      <p className="text-kpi mt-1">{wert}</p>
      {hinweis && <p className="text-meta text-muted-foreground mt-0.5">{hinweis}</p>}
    </div>
  );
}

function NichtZugewiesen({ nz }) {
  const [offen, setOffen] = useState(false);
  if (!nz.tickets) return null;
  return (
    <Box streifen="attention">
      <BoxKopf
        titel="Nicht zugewiesen"
        zaehler={nz.tickets}
        hinweis={`${fmtH(nz.std)} h${nz.ohne ? ` · ${nz.ohne} ohne Zeitvorgabe` : ''} · in ${nz.projekte.length} Projekten`}
        einklappbar
        offen={offen}
        onToggle={() => setOffen(!offen)}
      />
      {offen && (
        <div className="divide-y divide-[#eeeeee]">
          {nz.projekte.map((p) => (
            <div key={p.id} className="px-4 py-2 flex items-center gap-3">
              <TypPill project={p.projekt} />
              <div className="min-w-0 flex-1">
                <p className="truncate">{p.link ? <Link to={p.link} className="hover:underline font-medium">{p.titel}</Link> : <span className="font-medium">{p.titel}</span>}</p>
                <p className="text-meta text-muted-foreground truncate">{p.kunde}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="tabular-nums">{p.tickets} Tickets</p>
                <p className="text-meta text-muted-foreground">{fmtH(p.std)} h{p.ohne ? ` · ${p.ohne} ohne` : ''}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Box>
  );
}

export default function Monatsplanung() {
  const { user } = useAuth();
  const darf = istInhaber(user);
  const qc = useQueryClient();
  const monate = useMemo(() => monatsAuswahl(), []);
  const [monat, setMonat] = useState(monate[1].key);
  const [offen, setOffen] = useState(null);
  const [speichert, setSpeichert] = useState(false);

  const { data, isLoading } = useQuery({ queryKey: ['monatsplanung'], queryFn: ladePlanung, enabled: darf, staleTime: 60 * 1000 });
  const verfKey = ['monatsplanung-verfuegbar', monat];
  const { data: verf, isLoading: ladeVerf } = useQuery({ queryKey: verfKey, queryFn: () => ladeVerfuegbarkeit(monat), enabled: darf });
  const plan = useMemo(() => (data && verf ? rechnePlan(data, monat, verf) : null), [data, verf, monat]);

  const onVerfuegbar = async (person, verfuegbar) => {
    setSpeichert(true);
    try {
      await setzeVerfuegbar({ monat, email: person.key, verfuegbar, vorhanden: person.eintrag });
      await qc.invalidateQueries({ queryKey: verfKey });
    } catch {
      toast.error('Verfügbarkeit konnte nicht gespeichert werden.');
    } finally {
      setSpeichert(false);
    }
  };

  if (!darf) return null;
  const g = plan?.gesamt;

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <Seitenkopf
        bereich="Projekte"
        titel="Monatsplanung"
        kontext="Wer ist verfügbar, welche Retainer liegen bei wem, was ist im Monat fix vergeben, was liegt als Vorrat bereit"
      />
      <div className="flex flex-wrap items-center gap-1.5">
        {monate.map((m) => (
          <button key={m.key} type="button" className={knopf(monat === m.key)} onClick={() => { setMonat(m.key); setOffen(null); }}>
            {m.label}
          </button>
        ))}
      </div>

      {isLoading || ladeVerf || !plan ? <Skeleton className="h-64 w-full" /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Kennzahl label="Verfügbar" wert={`${g.verfuegbar} von ${g.team}`} hinweis={g.umverteilen ? `${g.umverteilen} nicht verfügbar mit Arbeit` : null} />
            <Kennzahl label="Retainer-Kontingente" wert={`${fmtH(g.retainerStd)} h`} hinweis="bei der Projektleitung" />
            <Kennzahl label="Fix im Monat" wert={`${fmtH(g.fixStd)} h`} hinweis={[g.fixOhne ? `${g.fixOhne} ohne Zeitvorgabe` : null, g.ueberfaellig ? `${g.ueberfaellig} überfällig` : null].filter(Boolean).join(' · ') || null} />
            <Kennzahl label="Vorrat ohne Termin" wert={`${g.vorratTickets} Tickets`} hinweis="zugewiesen, einplanbar" />
            <Kennzahl label="Nicht zugewiesen" wert={`${plan.nichtZugewiesen.tickets} Tickets`} hinweis={`${fmtH(plan.nichtZugewiesen.std)} h`} />
          </div>

          <div className="bg-white rounded border border-border overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  {SPALTEN.map((s) => <th key={s} className="text-left text-label uppercase text-muted-foreground font-medium px-3 py-2">{s}</th>)}
                </tr>
              </thead>
              <tbody>
                {plan.personen.map((p) => (
                  <PersonPlanZeile
                    key={p.key}
                    person={p}
                    offen={offen === p.key}
                    onToggle={() => setOffen(offen === p.key ? null : p.key)}
                    onVerfuegbar={onVerfuegbar}
                    speichert={speichert}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-meta text-muted-foreground">
            Gebunden = Retainer-Kontingente plus fix terminierte Stunden. Tickets in Retainern stecken im Kontingent und zählen nicht doppelt.
            Stunden je Ticket: Rest-Einschätzung, sonst Zeitvorgabe minus bereits geleistet (App und aWork); Tickets ohne Vorgabe oder mit aufgebrauchter Vorgabe werden gezählt, nicht geschätzt.
            Überfällige offene Tickets stehen im Monat mit.
          </p>

          <NichtZugewiesen nz={plan.nichtZugewiesen} />
        </>
      )}
    </div>
  );
}
