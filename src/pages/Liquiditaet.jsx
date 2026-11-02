import React, { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/shared/PageHeader';
import StatTile from '@/components/restructuring/StatTile';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { fmtEUR, fmtDate, OUTFLOW_CATEGORY_LABELS, OUTFLOW_INTERVAL_LABELS } from '@/lib/restructuring/restructuringFormat';
import {
  baueBetriebsLiquiditaet, EINGANG_ARTEN, AUSGANG_ARTEN, LIQ_STATUS_LABELS, kwVon,
} from '@/lib/liquiditaet/betriebsLiquiditaet';
import { useBetriebsLiquiditaetDaten, LIQ_KEY } from '@/lib/liquiditaet/useBetriebsLiquiditaet';
import { KostenpostenDialog, KontostandDialog } from '@/components/liquiditaet/LiquiditaetDialoge';

const kurzDatum = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : '—');
const BELEG_TEXT = { beleg: 'Rechnung', vertrag: 'Vertrag', plan: 'Plan', schaetzung: 'Schätzung', ist: 'Ist' };

function Belegmarke({ stufe }) {
  if (stufe === 'schaetzung') return <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1">Schätzung</span>;
  return <span className="text-[10px] text-muted-foreground border rounded px-1">{BELEG_TEXT[stufe] || stufe}</span>;
}

// ── Wochentabelle ──────────────────────────────────────────────────────────
function Wochentabelle({ plan, onZelle }) {
  const eingangsArten = Object.keys(EINGANG_ARTEN).filter((a) => plan.wochen.some((w) => w.eingang[a]));
  const ausgangsArten = Object.keys(AUSGANG_ARTEN).filter((a) => plan.wochen.some((w) => w.ausgang[a]));
  const zelle = (key, wert, onClick, cls = '') => (
    <td key={key} className={`px-2 py-1.5 text-right tabular-nums whitespace-nowrap ${cls}`}>
      {wert ? (onClick ? <button type="button" className="hover:underline" onClick={onClick}>{fmtEUR(wert)}</button> : fmtEUR(wert)) : <span className="text-muted-foreground/50">–</span>}
    </td>
  );
  const kopfZelle = 'sticky left-0 bg-card z-10 px-3 py-1.5 text-left whitespace-nowrap';
  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className={`${kopfZelle} font-medium`}>Woche</th>
            {plan.wochen.map((w) => (
              <th key={w.index} className="px-2 py-1.5 text-right font-medium whitespace-nowrap">
                KW {w.kw}<div className="font-normal text-[10px]">{kurzDatum(w.von)}–{kurzDatum(w.bis)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-b">
            <td className={kopfZelle}>Anfangsbestand</td>
            {plan.wochen.map((w) => zelle(w.index, w.anfang, null))}
          </tr>
          <tr className="border-b bg-emerald-50/40 font-semibold">
            <td className={`${kopfZelle} bg-emerald-50`}>Eingänge</td>
            {plan.wochen.map((w) => zelle(w.index, w.ein, () => onZelle(w, 'ein', null), 'text-emerald-700'))}
          </tr>
          {eingangsArten.map((a) => (
            <tr key={a} className="border-b border-border/40">
              <td className={`${kopfZelle} pl-6 text-muted-foreground`}>{EINGANG_ARTEN[a]}</td>
              {plan.wochen.map((w) => zelle(w.index, w.eingang[a], () => onZelle(w, 'ein', a)))}
            </tr>
          ))}
          <tr className="border-b bg-red-50/40 font-semibold">
            <td className={`${kopfZelle} bg-red-50`}>Ausgänge</td>
            {plan.wochen.map((w) => zelle(w.index, w.aus, () => onZelle(w, 'aus', null), 'text-red-700'))}
          </tr>
          {ausgangsArten.map((a) => (
            <tr key={a} className="border-b border-border/40">
              <td className={`${kopfZelle} pl-6 text-muted-foreground`}>{AUSGANG_ARTEN[a]}</td>
              {plan.wochen.map((w) => zelle(w.index, w.ausgang[a], () => onZelle(w, 'aus', a)))}
            </tr>
          ))}
          <tr className="border-b font-semibold">
            <td className={kopfZelle}>Endbestand</td>
            {plan.wochen.map((w) => zelle(w.index, w.ende, null, w.ende < 0 ? 'text-red-600' : ''))}
          </tr>
          <tr className="font-bold">
            <td className={kopfZelle}>davon verfügbar</td>
            {plan.wochen.map((w) => (
              <td key={w.index} className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${w.verfuegbar < 0 ? 'text-red-600 bg-red-50' : ''}`}>{fmtEUR(w.verfuegbar)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function Ereignisliste({ zeilen }) {
  if (!zeilen.length) return <p className="text-xs text-muted-foreground py-4">Keine Einträge.</p>;
  return (
    <div className="divide-y">
      {zeilen.map((e) => (
        <div key={e.id} className="py-2 text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium truncate">{e.label}</p>
              {e.kunde && e.art !== 'regie' && <p className="text-muted-foreground truncate">{e.kunde}</p>}
            </div>
            <p className="tabular-nums font-semibold whitespace-nowrap">{fmtEUR(e.betrag)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-muted-foreground">
            <span>{fmtDate(e.datum)}</span><Belegmarke stufe={e.belegstufe} />
            {e.szenario && <span className="text-[10px] font-semibold text-purple-700">Szenario</span>}
            {e.risiko && <span className="text-[10px] font-semibold text-amber-700">{e.risiko}</span>}
          </div>
          {e.hinweis && <p className="text-[11px] text-muted-foreground mt-0.5">{e.hinweis}</p>}
          {e.ersetzenDurch && <p className="text-[11px] text-amber-700 mt-0.5">ersetzen durch: {e.ersetzenDurch}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Seite ──────────────────────────────────────────────────────────────────
export default function Liquiditaet() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useBetriebsLiquiditaetDaten();
  const [mitSzenario, setMitSzenario] = useState(false);
  const [detail, setDetail] = useState(null);
  const [postenDialog, setPostenDialog] = useState({ offen: false, posten: null });
  const [kontoDialog, setKontoDialog] = useState(false);
  const neuLaden = () => qc.invalidateQueries({ queryKey: LIQ_KEY });

  const plan = useMemo(() => (data ? baueBetriebsLiquiditaet(data, { mitSzenario }) : null), [data, mitSzenario]);

  if (error) return <p className="text-sm text-red-600">Die Liquiditätsdaten konnten nicht geladen werden: {error.message}</p>;
  if (isLoading || !plan) {
    return <div className="space-y-4"><Skeleton className="h-10 w-64" /><div className="grid grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-96" /></div>;
  }

  const { konto, kennzahlen: k } = plan;
  const snapshotsSortiert = [...data.snapshots].sort((a, b) => (a.balance_date < b.balance_date ? 1 : -1));
  const kosten = [...data.kosten].sort((a, b) => (a.is_active === false) - (b.is_active === false) || (a.due_day_of_month || 1) - (b.due_day_of_month || 1));
  const monatsKosten = kosten.filter((c) => c.is_active !== false && !c.scenario_only && (c.interval || 'monthly') === 'monthly').reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const oeffneZelle = (w, richtung, art) => {
    const zeilen = plan.ereignisse.filter((e) => e.woche === w.index && e.richtung === richtung && (!art || e.art === art))
      .sort((a, b) => b.betrag - a.betrag);
    const name = art ? (richtung === 'ein' ? EINGANG_ARTEN[art] : AUSGANG_ARTEN[art]) : (richtung === 'ein' ? 'Eingänge' : 'Ausgänge');
    setDetail({ titel: `${name} · KW ${w.kw} (${kurzDatum(w.von)}–${kurzDatum(w.bis)})`, zeilen });
  };

  const statusSetzen = async (rechnung, status) => {
    await base44.entities.InvoiceRecord.update(rechnung.id, { liquiditaet_status: status });
    neuLaden();
  };
  const vertragUmschalten = async (vertragId, an) => {
    await base44.entities.RecurringContract.update(vertragId, { in_liquiditaet: an });
    neuLaden();
  };
  const postenLoeschen = async (p) => {
    if (!confirm(`Kostenposten „${p.label}" löschen? Zum vorübergehenden Herausnehmen lieber auf inaktiv setzen.`)) return;
    await base44.entities.CashOutflowItem.delete(p.id);
    neuLaden();
  };

  const warnungen = [];
  if (!konto.snapshot) warnungen.push('Kein Kontostand des Fortbetriebskontos erfasst – die Rechnung startet bei 0.');
  else if (konto.alterTage > 7) warnungen.push(`Der Kontostand ist ${konto.alterTage} Tage alt (${fmtDate(konto.datum)}). Bitte den neuesten Auszug eintragen.`);
  if (k.schaetzungAusAnzahl) warnungen.push(`${k.schaetzungAusAnzahl} Auszahlungen über ${fmtEUR(k.schaetzungAusSumme)} beruhen auf Schätzungen – im Reiter Kostenposten mit „Schätzung" markiert.`);
  if (k.ungeklaertSumme) warnungen.push(`${fmtEUR(k.ungeklaertSumme)} an Eingängen stammen aus Rechnungen mit ungeklärter Zahlung – Risiko Doppelzählung.`);
  if (k.verzoegertSumme) warnungen.push(`${fmtEUR(k.verzoegertSumme)} an Projektetappen sind über ihrem geplanten Freeze und noch nicht freigegeben.`);

  const tief = k.tiefster;
  const ts = k.tagsatzung;
  const eh = k.endeHorizont;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Liquidität"
        subtitle={`Fortbetriebskonto · rollierend ${plan.wochen.length} Wochen, KW ${kwVon(plan.start)} bis ${fmtDate(plan.ende)}`}
        actions={(
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Switch checked={mitSzenario} onCheckedChange={setMitSzenario} /> Szenario einrechnen
            </label>
            <Button size="sm" variant="outline" onClick={() => setKontoDialog(true)}><Landmark className="w-3.5 h-3.5" />Kontostand eintragen</Button>
          </div>
        )}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Verfügbar heute" value={fmtEUR(konto.verfuegbar)} tone={konto.verfuegbar < 0 ? 'negative' : 'default'}
          sub={`Kontostand ${fmtEUR(konto.stand)} per ${fmtDate(konto.datum)} · gesperrt ${fmtEUR(konto.gesperrt)}`} />
        <StatTile label="Tiefster Stand" value={tief ? fmtEUR(tief.verfuegbar) : '—'} tone={tief && tief.verfuegbar < 0 ? 'negative' : 'default'}
          sub={tief ? `verfügbar Ende KW ${tief.kw} (${kurzDatum(tief.bis)})` : ''} />
        <StatTile label="Tagsatzung 20.01.2027" value={ts ? fmtEUR(ts.verfuegbar) : '—'} tone={ts && ts.verfuegbar < 0 ? 'negative' : 'default'}
          sub={ts ? `verfügbar Ende KW ${ts.kw}` : 'außerhalb des Horizonts'} />
        <StatTile label="Ende Horizont" value={eh ? fmtEUR(eh.verfuegbar) : '—'} tone={eh && eh.verfuegbar < 0 ? 'negative' : 'default'}
          sub={`Eingänge ${fmtEUR(k.eingaengeSumme)} · Ausgänge ${fmtEUR(k.ausgaengeSumme)}`} />
      </div>

      {warnungen.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 space-y-1">
          {warnungen.map((w) => (
            <div key={w} className="flex items-start gap-2 text-xs text-amber-900"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /><span>{w}</span></div>
          ))}
        </div>
      )}

      <Wochentabelle plan={plan} onZelle={oeffneZelle} />
      <p className="text-[11px] text-muted-foreground -mt-3">Alle Beträge brutto. Ein Klick auf einen Betrag zeigt die einzelnen Posten mit Herkunft.</p>

      <Tabs defaultValue="kosten">
        <TabsList>
          <TabsTrigger value="kosten">Kostenposten</TabsTrigger>
          <TabsTrigger value="forderungen">Forderungen ({plan.forderungen.length})</TabsTrigger>
          <TabsTrigger value="projekte">Projekte & Verträge</TabsTrigger>
          <TabsTrigger value="nicht">Nicht eingeplant</TabsTrigger>
        </TabsList>

        <TabsContent value="kosten">
          <Card className="p-0 overflow-x-auto">
            <div className="flex items-center justify-between px-3 py-2 border-b">
              <p className="text-xs text-muted-foreground">Monatlich wiederkehrend (ohne Szenario): <b className="text-foreground">{fmtEUR(monatsKosten)}</b></p>
              <Button size="sm" variant="outline" onClick={() => setPostenDialog({ offen: true, posten: null })}><Plus className="w-3.5 h-3.5" />Posten anlegen</Button>
            </div>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-3 py-1.5">Posten</th><th className="text-left px-2 py-1.5">Kategorie</th>
                  <th className="text-right px-2 py-1.5">Betrag</th><th className="text-left px-2 py-1.5">Rhythmus</th>
                  <th className="text-left px-2 py-1.5">Beleg</th><th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {kosten.map((p) => (
                  <tr key={p.id} className={`border-b border-border/40 ${p.is_active === false ? 'opacity-50' : ''}`}>
                    <td className="px-3 py-1.5">
                      <p className="font-medium">{p.label}{p.scenario_only && <span className="ml-1.5 text-[10px] font-semibold text-purple-700">Szenario</span>}{p.is_active === false && <span className="ml-1.5 text-[10px]">inaktiv</span>}</p>
                      {p.derivation && <p className="text-[11px] text-muted-foreground line-clamp-2">{p.derivation}</p>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{OUTFLOW_CATEGORY_LABELS[p.category] || p.category}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtEUR(p.amount)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {OUTFLOW_INTERVAL_LABELS[p.interval || 'monthly']}, am {p.due_day_of_month || 1}.
                      {p.interval === 'once' && p.first_due_month ? ` (${p.first_due_month})` : ''}
                      {p.start_month && p.interval !== 'once' ? ` ab ${p.start_month}` : ''}{p.end_month ? ` bis ${p.end_month}` : ''}
                    </td>
                    <td className="px-2 py-1.5">
                      <Belegmarke stufe={p.belegstufe || 'ist'} />
                      {p.belegstufe === 'schaetzung' && p.ersetzen_durch && <p className="text-[10px] text-amber-700 mt-0.5">{p.ersetzen_durch}</p>}
                    </td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <Button size="icon-sm" variant="ghost" onClick={() => setPostenDialog({ offen: true, posten: p })} title="Bearbeiten"><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => postenLoeschen(p)} title="Löschen"><Trash2 className="w-3.5 h-3.5" /></Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="forderungen">
          <Card className="p-0 overflow-x-auto">
            <p className="px-3 py-2 border-b text-xs text-muted-foreground">
              Offene Rechnungen ab 24.07.2026 aus sevDesk. Der Liquiditätsstatus gilt nur hier und ändert nichts in sevDesk.
            </p>
            <table className="w-full text-xs">
              <thead className="text-muted-foreground border-b">
                <tr>
                  <th className="text-left px-3 py-1.5">Rechnung</th><th className="text-left px-2 py-1.5">Kunde</th>
                  <th className="text-left px-2 py-1.5">fällig</th><th className="text-right px-2 py-1.5">offen</th>
                  <th className="text-left px-2 py-1.5">Eingang erwartet</th><th className="text-left px-2 py-1.5">Liquiditätsstatus</th>
                </tr>
              </thead>
              <tbody>
                {plan.forderungen.map((f) => (
                  <tr key={f.id} className="border-b border-border/40">
                    <td className="px-3 py-1.5 whitespace-nowrap tabular-nums">{f.quelle.nummer || '—'}</td>
                    <td className="px-2 py-1.5 max-w-[260px] truncate" title={f.kunde}>{f.kunde}</td>
                    <td className={`px-2 py-1.5 whitespace-nowrap ${f.faellig && f.faellig < plan.heute ? 'text-red-600' : ''}`}>{fmtDate(f.faellig)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums whitespace-nowrap">{fmtEUR(f.betrag)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap" title={f.hinweis || ''}>
                      {f.erwartet ? `KW ${kwVon(f.erwartet)} · ${kurzDatum(f.erwartet)}` : <span className="text-muted-foreground">ausgebucht</span>}
                      {f.risiko && <span className="ml-1 text-[10px] text-amber-700">Risiko</span>}
                    </td>
                    <td className="px-2 py-1.5" title={f.notiz || ''}>
                      <Select value={f.liqStatus} onValueChange={(v) => statusSetzen(f, v)}>
                        <SelectTrigger className="h-7 text-xs w-[180px]"><SelectValue /></SelectTrigger>
                        <SelectContent>{Object.entries(LIQ_STATUS_LABELS).map(([kk, l]) => <SelectItem key={kk} value={kk}>{l}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="projekte" className="space-y-3">
          {[
            ['Projektetappen (Sprint)', plan.etappenZeilen, 'Etappenbetrag netto + 20 % USt; Rechnung zum geplanten Freeze, Zahlung + 14 Tage.'],
            ['Abrechnungsanweisungen', plan.anweisungsZeilen, 'Offene Anweisungen mit aktuellem Rechnungsdatum oder in den letzten 30 Tagen angelegt.'],
            ['Regie & Support', plan.regieZeilen, 'Verrechenbare, noch nicht abgerechnete Zeit seit 24.07.2026 als Sammelrechnung.'],
          ].map(([titel, zeilen, erklaerung]) => (
            <Card key={titel} className="p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">{titel}</p>
                <p className="text-xs tabular-nums font-semibold">{fmtEUR(zeilen.reduce((s, e) => s + e.betrag, 0))}</p>
              </div>
              <p className="text-[11px] text-muted-foreground mb-1">{erklaerung}</p>
              <Ereignisliste zeilen={zeilen} />
            </Card>
          ))}
          <Card className="p-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold">Retainer & Verträge ohne Rechnung</p>
              <p className="text-xs tabular-nums font-semibold">{fmtEUR(plan.vertragsZeilen.reduce((s, e) => s + e.betrag, 0))}</p>
            </div>
            <p className="text-[11px] text-muted-foreground mb-1">Nur Monate, für die beim Kunden noch keine Rechnung existiert. Doppelte oder anders verrechnete Verträge hier herausnehmen.</p>
            <div className="divide-y">
              {plan.vertragsZeilen.map((e) => (
                <div key={e.id} className="py-2 text-xs flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{e.kunde}</p>
                    <p className="text-muted-foreground truncate">{e.label} · Eingang {fmtDate(e.datum)}</p>
                  </div>
                  <div className="flex items-center gap-2 whitespace-nowrap">
                    <span className="tabular-nums font-semibold">{fmtEUR(e.betrag)}</span>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => vertragUmschalten(e.quelle.id, false)} title="Diesen Vertrag nicht mehr als Eingang ansetzen">herausnehmen</Button>
                  </div>
                </div>
              ))}
              {!plan.vertragsZeilen.length && <p className="text-xs text-muted-foreground py-4">Keine Einträge.</p>}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="nicht" className="space-y-3">
          <p className="text-xs text-muted-foreground">Bewusst nicht in der Planung – sichtbar, damit nichts still verloren geht.</p>
          {plan.nichtEingeplant.map((g) => (
            <Card key={g.grund} className="p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">{g.grund} <span className="font-normal text-muted-foreground">({g.zeilen.length})</span></p>
                <p className="text-xs tabular-nums font-semibold">{fmtEUR(g.summe)}</p>
              </div>
              <div className="divide-y mt-1">
                {g.zeilen.map((e) => (
                  <div key={e.id} className="py-1.5 text-xs flex justify-between gap-3">
                    <span className="truncate">{e.label} · {e.kunde}</span>
                    <span className="tabular-nums whitespace-nowrap">{fmtEUR(e.betrag)}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {plan.ausgebucht.length > 0 && (
            <Card className="p-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-semibold">Bereits im Kontostand (in sevDesk noch offen) <span className="font-normal text-muted-foreground">({plan.ausgebucht.length})</span></p>
                <p className="text-xs tabular-nums font-semibold">{fmtEUR(plan.ausgebucht.reduce((s, e) => s + e.betrag, 0))}</p>
              </div>
              <div className="divide-y mt-1">
                {plan.ausgebucht.map((e) => (
                  <div key={e.id} className="py-1.5 text-xs flex justify-between gap-3">
                    <span className="truncate">{e.label} · {e.kunde} · {LIQ_STATUS_LABELS[e.liqStatus]}</span>
                    <span className="tabular-nums whitespace-nowrap">{fmtEUR(e.betrag)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle className="text-base">{detail?.titel}</SheetTitle></SheetHeader>
          {detail && (
            <>
              <p className="text-xs text-muted-foreground mt-1">Summe {fmtEUR(detail.zeilen.reduce((s, e) => s + e.betrag, 0))}</p>
              <Ereignisliste zeilen={detail.zeilen} />
            </>
          )}
        </SheetContent>
      </Sheet>

      <KostenpostenDialog open={postenDialog.offen} posten={postenDialog.posten} onClose={() => setPostenDialog({ offen: false, posten: null })} onGespeichert={neuLaden} />
      <KontostandDialog open={kontoDialog} snapshots={snapshotsSortiert} onClose={() => setKontoDialog(false)} onGespeichert={neuLaden} />
    </div>
  );
}
