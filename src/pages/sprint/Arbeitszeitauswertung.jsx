import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/lib/AuthContext';
import { istInhaber } from '@/lib/auslastung/inhaber';
import { ZEITRAEUME, zeitraum as berechneZeitraum, isoVon, fmtDatum } from '@/lib/arbeitszeit/kalender';
import { werteAus, fmtStd, fmtQuote } from '@/lib/arbeitszeit/auswertung';
import { ladeArbeitszeit, speichereWochenSoll } from '@/lib/arbeitszeit/arbeitszeitDaten';
import AzKennzahlen from '@/components/arbeitszeit/AzKennzahlen';
import AzVerlauf from '@/components/arbeitszeit/AzVerlauf';
import AzPersonen from '@/components/arbeitszeit/AzPersonen';
import AzVerteilung, { AzProjekte } from '@/components/arbeitszeit/AzVerteilung';

const knopf = (aktiv) => `text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border ${aktiv ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-border hover:bg-muted'}`;

function csvExport(personen, zr) {
  const kopf = ['Person', 'Aktiv', 'Soll h/Woche', 'Arbeitstage', 'Abwesend', 'Soll h', 'Erfasst h', 'Differenz h', 'Erfasst/Soll', 'Verrechenbar h', 'Anteil verrechenbar', 'Verrechenbar/Soll', 'Nicht verrechenbar h', 'Mehraufwand h', 'Offene Tage'];
  const q = (v) => (v === null || v === undefined ? '' : String(Math.round(v * 100)));
  const zeilen = personen.map((p) => [p.name, p.aktiv ? 'ja' : 'nein', p.aktiv ? p.wochenStd : '', p.sollTage, p.abwesendTage, fmtStd(p.sollMin), fmtStd(p.erfasstMin),
    p.saldoMin === null ? '' : fmtStd(p.saldoMin), q(p.erfassungsquote), fmtStd(p.verrMin), q(p.verrQuote), q(p.produktiv), fmtStd(p.nvMin), fmtStd(p.mehrMin), p.offeneTage]);
  const text = [kopf, ...zeilen].map((z) => z.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `arbeitszeit_${zr.von}_${zr.auswertungBis}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Arbeitszeitauswertung() {
  const { user } = useAuth();
  const darf = istInhaber(user);
  const qc = useQueryClient();
  const [key, setKey] = useState('monat');
  const heute = isoVon(new Date());
  const zr = useMemo(() => berechneZeitraum(key, heute), [key, heute]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['arbeitszeitauswertung', zr.von, zr.auswertungBis],
    queryFn: () => ladeArbeitszeit(zr),
    enabled: darf,
    staleTime: 5 * 60 * 1000,
  });
  const ergebnis = useMemo(() => (data ? werteAus({ ...data, zeitraum: zr, heute }) : null), [data, zr, heute]);

  const sollSpeichern = async (email, stunden) => {
    try {
      await speichereWochenSoll(data.sollSetting, { ...data.wochenSoll, [email]: stunden });
      await qc.invalidateQueries({ queryKey: ['arbeitszeitauswertung'] });
      toast.success(stunden === '' ? 'Standard-Soll gilt wieder' : `Soll auf ${stunden} h je Woche gesetzt`);
    } catch (e) {
      toast.error(`Speichern fehlgeschlagen: ${e?.message || e}`);
    }
  };

  if (!darf) return null;

  const q = ergebnis?.quellen;
  return (
    <div className="max-w-[1400px] mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Arbeitszeitauswertung</h1>
          <p className="text-meta text-muted-foreground mt-1">
            {fmtDatum(zr.von)} – {fmtDatum(zr.bis)}
            {!zr.leer && zr.auswertungBis < zr.bis && ` · ausgewertet bis ${fmtDatum(zr.auswertungBis)} (heute läuft noch)`}
            {ergebnis && ` · ${ergebnis.arbeitstage} Arbeitstage`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {ZEITRAEUME.map((z) => <button key={z.key} type="button" className={knopf(key === z.key)} onClick={() => setKey(z.key)}>{z.label}</button>)}
          {ergebnis?.personen.length > 0 && (
            <button type="button" className={`${knopf(false)} inline-flex items-center gap-1`} onClick={() => csvExport(ergebnis.personen, zr)}>
              <Download className="w-3.5 h-3.5" /> CSV
            </button>
          )}
        </div>
      </div>

      {isError ? (
        <div className="bg-white rounded border border-border p-6 text-center space-y-2">
          <p>Die Daten konnten nicht geladen werden.</p>
          <button type="button" className={knopf(false)} onClick={() => refetch()}>Erneut versuchen</button>
        </div>
      ) : isLoading || !ergebnis ? (
        <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /><Skeleton className="h-72 w-full" /></div>
      ) : zr.leer ? (
        <p className="bg-white rounded border border-border p-8 text-center text-muted-foreground">
          In diesem Zeitraum ist noch kein Tag abgeschlossen. Ausgewertet wird immer bis gestern.
        </p>
      ) : (
        <>
          <div className="text-meta text-muted-foreground space-y-0.5">
            <p>
              Quelle: {q.awork && `aWork bis ${fmtDatum(q.aworkBis)}`}{q.awork && q.app && ' · '}{q.app && `App ab ${fmtDatum(q.appAb)}`}.
              {' '}„Erfasst" ist gebuchte Zeit, nicht Anwesenheit. Soll: {fmtStd(data.standardStdTag * 60)} h je Arbeitstag, außer bei individueller Wochenzeit.
            </p>
            {ergebnis.feiertage.length > 0 && <p>Feiertage im Zeitraum: {ergebnis.feiertage.map((f) => `${f.name} (${fmtDatum(f.tag)})`).join(', ')}.</p>}
            {(ergebnis.gesamt.wochenendMin > 0 || ergebnis.gesamt.feiertagMin > 0) && (
              <p>Davon an Wochenenden {fmtStd(ergebnis.gesamt.wochenendMin)} h{ergebnis.gesamt.feiertagMin > 0 && `, an Feiertagen ${fmtStd(ergebnis.gesamt.feiertagMin)} h`} — zählt zur erfassten Zeit, nicht zum Soll.</p>
            )}
            {q.ohneZuordnung.length > 0 && <p>aWork-Namen ohne Teammitglied: {q.ohneZuordnung.join(', ')}.</p>}
            {data.abgeschnitten && <p className="text-destructive">Sehr viele Buchungen — es wurden nur die ersten 20.000 berücksichtigt. Bitte einen kürzeren Zeitraum wählen.</p>}
          </div>

          <AzKennzahlen gesamt={ergebnis.gesamt} mitApp={q.app} />
          <AzVerlauf verlauf={ergebnis.verlauf} taeglich={ergebnis.taeglich} />
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-section font-bold uppercase tracking-tight">Je Person</h2>
              <span className="text-meta text-muted-foreground">
                Teamschnitt: {fmtQuote(ergebnis.gesamt.erfassungsquote)} erfasst · {fmtQuote(ergebnis.gesamt.produktiv)} verrechenbar vom Soll
              </span>
            </div>
            <AzPersonen personen={ergebnis.personen} standardWoche={data.standardStdTag * 5} onSollSpeichern={sollSpeichern} mitApp={q.app} />
            <p className="text-meta text-muted-foreground">
              Soll h/Woche: leer lassen für den Standard ({data.standardStdTag * 5} h), für Teilzeit die Wochenstunden eintragen — verteilt auf Mo–Fr.
              Offene Tage zählen erst ab {fmtDatum(q.pflichtAb)}.
            </p>
          </div>
          <AzVerteilung ergebnis={ergebnis} />
          <AzProjekte projekte={ergebnis.projekte} />
        </>
      )}
    </div>
  );
}
