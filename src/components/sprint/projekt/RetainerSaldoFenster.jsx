import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { RITTLER, STATUS_COLORS, fmtDate } from '@/components/sprint/sprintConfig';
import { h1 } from '@/lib/sprint/behaelterZahlen';

// Retainer: wie der Saldo entstanden ist — Gesamtansicht (zwölf Monate) und Monatsansicht.
// Rechnet erst beim Öffnen (Funktion retainerSaldoVerlauf), nur lesend, nur Stunden.
// Das Ergebnis bleibt zehn Minuten im Speicher — erneutes Öffnen rechnet nicht neu.

const monatLang = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString('de-AT', { month: 'long', year: 'numeric' });
const monatKurz = (m) => new Date(`${m}-01T12:00:00`).toLocaleDateString('de-AT', { month: 'short', year: 'numeric' });
const vz = (v) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${h1(Math.abs(v))}`);
const hh = (v) => (v == null ? '—' : h1(v));
const saldoFarbe = (v) => (v == null ? undefined : v >= 0 ? STATUS_COLORS.doneText : STATUS_COLORS.attention);
const abweichung = (v) => Math.abs(Number(v) || 0) >= 0.05;

const knopf = (aktiv) => `text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border ${aktiv
  ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-border hover:bg-muted'}`;

function Hinweis({ farbe = STATUS_COLORS.attention, flaeche = STATUS_COLORS.attentionSurface, children }) {
  return (
    <div className="flex items-start gap-2 rounded px-3 py-2 text-[12.5px]" style={{ color: farbe, backgroundColor: flaeche }}>
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

const ladeVerlauf = async (body) => {
  const res = await base44.functions.invoke('retainerSaldoVerlauf', body);
  const data = res?.data || {};
  if (data.error) throw new Error(data.error);
  return data;
};

function PeriodeBlock({ p, stichtag, onMonat }) {
  const th = 'text-label uppercase text-muted-foreground font-medium px-2.5 py-2 whitespace-nowrap';
  const td = 'px-2.5 py-1.5 text-right tabular-nums whitespace-nowrap';
  return (
    <div className="bg-white rounded border border-border">
      <div className="px-4 pt-3 pb-2 border-b border-border">
        <p className="text-[13px] font-bold">
          {p.abgeschlossen
            ? `Abgeschlossene Periode ${fmtDate(p.beginn)} – ${fmtDate(p.ende)}`
            : `Laufende Periode seit ${fmtDate(p.beginn)}`}
        </p>
        <p className="text-meta text-muted-foreground">
          Standardkontingent {h1(p.standard)} h / Monat
          {p.anfangsstand_vor_fenster != null
            ? ` · Stand vor ${monatLang(p.zeilen[0]?.monat)}: ${vz(p.anfangsstand_vor_fenster)} h (Periode begann früher)`
            : ` · Übertrag zu Periodenbeginn: ${vz(p.uebertrag)} h`}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-body">
          <thead>
            <tr className="border-b border-border">
              <th className={`${th} text-left`}>Monat</th>
              <th className={`${th} text-right`}>Kontingent</th>
              <th className={`${th} text-right`}>Gebucht</th>
              <th className={`${th} text-right`} title={`bis ${fmtDate(stichtag)}`}>davon aWork</th>
              <th className={`${th} text-right`}>davon App</th>
              <th className={`${th} text-right`} title="In der App als nicht verrechenbar gebucht — zählt trotzdem gegen das Kontingent">nicht verr.</th>
              <th className={`${th} text-right`}>Monat ±</th>
              <th className={`${th} text-right`}>Saldo</th>
            </tr>
          </thead>
          <tbody>
            {p.zeilen.map((z) => (
              <tr
                key={z.monat}
                className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/50"
                onClick={() => onMonat(p.index, z.monat)}
                title="Monat im Detail ansehen"
              >
                <td className="px-2.5 py-1.5 whitespace-nowrap font-medium underline-offset-2 hover:underline">{monatKurz(z.monat)}</td>
                <td className={td}>
                  {h1(z.kontingent)}
                  {z.kontingent_belegt && <span className="ml-1 text-[10px] text-muted-foreground" title="laut eingetragenem Kontingentverlauf">belegt</span>}
                </td>
                <td className={`${td} font-medium`}>{h1(z.gebucht)}</td>
                <td className={td}>{hh(z.awork)}</td>
                <td className={td}>{h1(z.app)}</td>
                <td className={td}>
                  {z.nicht_verrechenbar > 0 ? h1(z.nicht_verrechenbar) : '–'}
                  {z.intern > 0 && (
                    <span className="block text-[10.5px]" style={{ color: STATUS_COLORS.attention }} title="Fehler von uns, interne Nacharbeit oder Einarbeitung">
                      {h1(z.intern)} intern
                    </span>
                  )}
                </td>
                <td className={td} style={{ color: saldoFarbe(z.monatssaldo) }}>{vz(z.monatssaldo)}</td>
                <td className={`${td} font-bold`} style={{ color: saldoFarbe(z.laufender_saldo) }}>{vz(z.laufender_saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 border-t border-border space-y-2 text-[12.5px]">
        <p>
          <span className="text-muted-foreground">{p.abgeschlossen ? 'Saldo Periodenende, gerechnet: ' : 'Saldo heute, gerechnet: '}</span>
          <b style={{ color: saldoFarbe(p.gerechnet.saldo) }}>{vz(p.gerechnet.saldo)} h</b>
          <span className="text-muted-foreground"> · {h1(p.gerechnet.gebucht)} von {h1(p.gerechnet.verfuegbar)} h</span>
        </p>
        {p.abgeschlossen && p.abschluss && (
          <>
            <p className="text-muted-foreground">
              Beim Abschluss{p.abschluss.abgeschlossen_am ? ` am ${fmtDate(p.abschluss.abgeschlossen_am)}` : ''} festgehalten:{' '}
              <b style={{ color: saldoFarbe(p.abschluss.saldo) }}>{vz(p.abschluss.saldo)} h</b> — dieser Wert ging als Übertrag in die nächste Periode.
            </p>
            {abweichung(p.abschluss.differenz_saldo) && (
              <Hinweis>
                Die Aufstellung weicht vom Abschluss um <b>{vz(p.abschluss.differenz_saldo)} h</b> ab
                {abweichung(p.abschluss.differenz_verfuegbar) ? ` (Kontingent ${vz(p.abschluss.differenz_verfuegbar)} h, z. B. durch den eingetragenen Kontingentverlauf)` : ''}
                {abweichung(p.abschluss.differenz_gebucht) ? ` (gebucht ${vz(-p.abschluss.differenz_gebucht)} h)` : ''}.
                Der Übertrag wurde nicht verändert. Vor dem Kundengespräch klären.
              </Hinweis>
            )}
          </>
        )}
        {!p.abgeschlossen && p.kopf && abweichung(p.kopf.differenz_saldo) && (
          <Hinweis>
            Der Projektkopf zeigt <b>{vz(p.kopf.saldo)} h</b>, die Aufstellung {vz(p.gerechnet.saldo)} h.
            {abweichung(p.kopf.gebucht_awork_im_projekt - p.kopf.gebucht_awork_sicherung)
              ? ` Ursache: Im Projekt ist ein aWork-Stand von ${h1(p.kopf.gebucht_awork_im_projekt)} h eingetragen, die aWork-Sicherung enthält ${h1(p.kopf.gebucht_awork_sicherung)} h.`
              : ''}
          </Hinweis>
        )}
        {p.aworkUnvollstaendig && (
          <Hinweis farbe={STATUS_COLORS.critical} flaeche={STATUS_COLORS.criticalSurface}>
            aWork-Zeiten dieser Periode fehlen — die Summen sind unvollständig.
          </Hinweis>
        )}
      </div>
    </div>
  );
}

function MonatDetail({ projectId, wahl, zeile }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['retainerSaldoMonat', projectId, wahl?.periode, wahl?.monat],
    queryFn: () => ladeVerlauf({ project_id: projectId, monat: wahl.monat, periode: wahl.periode }),
    enabled: !!wahl,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  if (!wahl) return <p className="text-meta text-muted-foreground">Kein Monat gewählt.</p>;
  if (isLoading) return <p className="flex items-center gap-2 text-meta text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Monat wird aufgeschlüsselt …</p>;
  if (error) return <Hinweis farbe={STATUS_COLORS.critical} flaeche={STATUS_COLORS.criticalSurface}>Konnte nicht geladen werden: {error.message}</Hinweis>;

  const internListe = data.auffaellig.filter((a) => a.intern);
  return (
    <div className="space-y-3">
      {zeile && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            ['Kontingent', `${h1(zeile.kontingent)} h`],
            ['Gebucht', `${h1(zeile.gebucht)} h`],
            ['Monat ±', `${vz(zeile.monatssaldo)} h`, saldoFarbe(zeile.monatssaldo)],
            ['Saldo danach', `${vz(zeile.laufender_saldo)} h`, saldoFarbe(zeile.laufender_saldo)],
          ].map(([l, w, f]) => (
            <div key={l} className="bg-white rounded border border-border px-3 py-2">
              <p className="text-label uppercase text-muted-foreground">{l}</p>
              <p className="text-[17px] font-bold tabular-nums" style={{ color: f }}>{w}</p>
            </div>
          ))}
        </div>
      )}

      {data.aworkFehler && <Hinweis farbe={STATUS_COLORS.critical} flaeche={STATUS_COLORS.criticalSurface}>{data.aworkFehler} Die aWork-Zeiten fehlen in dieser Aufstellung.</Hinweis>}

      {internListe.length > 0 && (
        <Hinweis>
          <b>Vor dem Kundengespräch prüfen:</b> {h1(internListe.reduce((s, a) => s + a.stunden, 0))} h sind als „Fehler von uns“, „interne Nacharbeit“ oder „Einarbeitung“ gebucht und zählen gegen das Kontingent.
        </Hinweis>
      )}

      <div className="bg-white rounded border border-border overflow-x-auto">
        <p className="px-4 pt-3 pb-1 text-label uppercase text-muted-foreground">Wofür die Zeit verwendet wurde</p>
        {data.aufgaben.length ? (
          <table className="w-full text-body">
            <tbody>
              {data.aufgaben.map((a) => (
                <tr key={`${a.quelle}:${a.aufgabe}`} className="border-t border-border align-top">
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{a.aufgabe}</span>
                    <span className="block text-meta text-muted-foreground">
                      {a.quelle === 'awork' ? 'aWork' : 'App'} · {a.personen.map((p) => `${p.name} ${h1(p.stunden)} h`).join(' · ')}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap font-medium">
                    {h1(a.stunden)} h
                    {a.nicht_verrechenbar > 0 && <span className="block text-meta text-muted-foreground font-normal">{h1(a.nicht_verrechenbar)} h nicht verr.</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="px-4 pb-3 text-meta text-muted-foreground">In diesem Monat ist nichts gebucht.</p>}
      </div>

      {data.personen.length > 0 && (
        <div className="bg-white rounded border border-border px-4 py-3">
          <p className="text-label uppercase text-muted-foreground mb-1">Nach Person</p>
          <p className="text-[13px]">{data.personen.map((p) => `${p.name} ${h1(p.stunden)} h`).join(' · ')}</p>
        </div>
      )}

      {data.auffaellig.length > 0 && (
        <div className="bg-white rounded border border-border overflow-x-auto">
          <p className="px-4 pt-3 pb-1 text-label uppercase text-muted-foreground">Gekennzeichnete Buchungen (App)</p>
          <table className="w-full text-body">
            <tbody>
              {data.auffaellig.map((a, i) => (
                <tr key={i} className="border-t border-border align-top">
                  <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{fmtDate(a.datum)}</td>
                  <td className="px-3 py-1.5">
                    {a.person}{a.aufgabe ? ` · ${a.aufgabe}` : ''}
                    {a.notiz && <span className="block text-meta text-muted-foreground">{a.notiz}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-meta whitespace-nowrap">
                    {[a.grund && `nicht verr.: ${a.grund}`, a.mehrleistung && 'Mehraufwand', a.ueber_kontingent && 'über Kontingent'].filter(Boolean).join(' · ')}
                    {a.intern && <span className="block font-semibold" style={{ color: STATUS_COLORS.attention }}>vor Kundengespräch prüfen</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap">{h1(a.stunden)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RetainerSaldoFenster({ project, client, open, onOpenChange }) {
  const [ansicht, setAnsicht] = useState('gesamt');
  const [wahl, setWahl] = useState(null); // { periode, monat }

  const { data, isLoading, error } = useQuery({
    queryKey: ['retainerSaldoVerlauf', project?.id],
    queryFn: () => ladeVerlauf({ project_id: project.id }),
    enabled: open && !!project?.id,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  // Alle sichtbaren Monate für die Auswahl, jüngster zuerst
  const monate = useMemo(() => (data?.perioden || [])
    .flatMap((p) => p.zeilen.map((z) => ({ periode: p.index, monat: z.monat, zeile: z, key: `${p.index}:${z.monat}` })))
    .sort((a, b) => b.monat.localeCompare(a.monat) || b.periode - a.periode), [data]);

  // Standard der Monatsansicht: der letzte abgeschlossene Monat, sonst der laufende
  useEffect(() => {
    if (wahl || !monate.length || !data) return;
    const laufend = data.heute.slice(0, 7);
    const m = monate.find((x) => x.monat < laufend) || monate[0];
    setWahl({ periode: m.periode, monat: m.monat });
  }, [monate, data, wahl]);

  const gewaehlt = monate.find((m) => wahl && m.periode === wahl.periode && m.monat === wahl.monat);
  const zeigeVerlaufHinweis = data && !data.projekt.verlauf_eingetragen && data.perioden.some((p) => p.abgeschlossen);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[922px] overflow-y-auto p-0">
        <SheetHeader className="px-5 pt-5 pb-3 pr-12 border-b border-border space-y-1">
          <SheetTitle className="text-section font-bold uppercase tracking-tight">Wie der Saldo entstanden ist</SheetTitle>
          <SheetDescription className="text-meta">
            {[client?.name, project?.title].filter(Boolean).join(' · ')} · letzte zwölf Monate · nur Stunden
          </SheetDescription>
          <div className="flex gap-2 pt-2">
            <button type="button" className={knopf(ansicht === 'gesamt')} onClick={() => setAnsicht('gesamt')}>Gesamt</button>
            <button type="button" className={knopf(ansicht === 'monat')} onClick={() => setAnsicht('monat')}>Monat</button>
            {ansicht === 'monat' && monate.length > 0 && (
              <select
                className="h-7 px-2 rounded border border-border bg-white text-meta"
                value={gewaehlt?.key || ''}
                onChange={(e) => {
                  const m = monate.find((x) => x.key === e.target.value);
                  if (m) setWahl({ periode: m.periode, monat: m.monat });
                }}
                aria-label="Monat"
              >
                {monate.map((m) => <option key={m.key} value={m.key}>{monatLang(m.monat)}</option>)}
              </select>
            )}
          </div>
        </SheetHeader>

        <div className="px-5 py-4 space-y-3" style={{ backgroundColor: RITTLER.surface }}>
          {isLoading && <p className="flex items-center gap-2 text-meta text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Wird berechnet …</p>}
          {error && <Hinweis farbe={STATUS_COLORS.critical} flaeche={STATUS_COLORS.criticalSurface}>Konnte nicht berechnet werden: {error.message}</Hinweis>}

          {data && (
            <>
              {data.aworkFehler && (
                <Hinweis farbe={STATUS_COLORS.critical} flaeche={STATUS_COLORS.criticalSurface}>
                  {data.aworkFehler} Die Zeiten bis {fmtDate(data.stichtag)} fehlen — die Aufstellung ist unvollständig.
                </Hinweis>
              )}
              {zeigeVerlaufHinweis && (
                <Hinweis>
                  Das Monatskontingent ist für frühere Monate nicht belegt — gerechnet wird mit dem Standardwert der jeweiligen Periode.
                  Hat sich das Kontingent geändert, bitte unter „Projekt bearbeiten“ den Kontingentverlauf mit Beleg eintragen.
                </Hinweis>
              )}

              {ansicht === 'gesamt' && (
                data.perioden.length
                  ? data.perioden.map((p) => (
                    <PeriodeBlock
                      key={p.index}
                      p={p}
                      stichtag={data.stichtag}
                      onMonat={(periode, monat) => { setWahl({ periode, monat }); setAnsicht('monat'); }}
                    />
                  ))
                  : <p className="text-meta text-muted-foreground">Kein Laufzeitbeginn gepflegt — es gibt nichts aufzuschlüsseln.</p>
              )}

              {ansicht === 'monat' && <MonatDetail projectId={project.id} wahl={wahl} zeile={gewaehlt?.zeile} />}

              <p className="text-[11.5px] text-muted-foreground">
                Bis {fmtDate(data.stichtag)} zählen die Zeiten aus der aWork-Sicherung
                {data.projekt.awork_project_id ? ' (nur das verknüpfte aWork-Projekt)' : ' — mit diesem Projekt ist kein aWork-Projekt verknüpft'}, danach die Buchungen in der App.
                Jeder angefangene Monat zählt mit dem vollen Kontingent. Nicht verrechenbare Stunden zählen gegen das Kontingent.
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
