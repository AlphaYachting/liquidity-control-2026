import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpRight, ChevronDown, Landmark } from 'lucide-react';
import { fmtEUR, fmtDate, monthLabel } from '@/lib/restructuring/restructuringFormat';
import { LIQ_STATUS_LABELS } from '@/lib/liquiditaet/betriebsLiquiditaet';
import { speichereEinstellung } from '@/lib/liquiditaet/useBetriebsLiquiditaet';

const kurz = (d) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.` : '—');

// Erledigt-Häkchen gelten nur für die Woche und nur in diesem Browser — der echte Stand ändert sich,
// sobald die Rechnung gestellt, die Zahlung da oder die Etappe freigegeben ist.
function useErledigt(woche) {
  const key = `liq-erledigt-${woche}`;
  const [set, setSet] = useState(() => {
    try { return new Set(JSON.parse(window.localStorage.getItem(key) || '[]')); } catch { return new Set(); }
  });
  const umschalten = (id) => setSet((alt) => {
    const neu = new Set(alt);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    try { window.localStorage.setItem(key, JSON.stringify([...neu])); } catch { /* ohne Speicher nur für diese Sitzung */ }
    return neu;
  });
  return [set, umschalten];
}

function Gruppe({ titel, summe, anzahl, offen: startOffen = true, erklaerung, children }) {
  const [offen, setOffen] = useState(startOffen);
  return (
    <div className="border-t first:border-t-0">
      <button type="button" onClick={() => setOffen(!offen)} className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-muted/40">
        <span className="text-sm font-semibold">{titel} <span className="font-normal text-muted-foreground">({anzahl})</span></span>
        <span className="flex items-center gap-2 text-xs tabular-nums font-semibold">
          {summe !== null && summe !== undefined ? fmtEUR(summe) : ''}
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${offen ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {offen && (
        <div className="px-4 pb-3">
          {erklaerung && <p className="text-[11px] text-muted-foreground mb-1">{erklaerung}</p>}
          {anzahl === 0 ? <p className="text-xs text-muted-foreground py-1">Nichts offen.</p> : children}
        </div>
      )}
    </div>
  );
}

function Zeile({ id, erledigt, onToggle, children, betrag, zustaendig, link }) {
  const fertig = erledigt.has(id);
  return (
    <div className={`flex items-start gap-3 py-1.5 border-b border-border/40 last:border-b-0 text-xs ${fertig ? 'opacity-45' : ''}`}>
      <Checkbox checked={fertig} onCheckedChange={() => onToggle(id)} className="mt-0.5" aria-label="erledigt" />
      <div className="flex-1 min-w-0">{children}</div>
      {zustaendig && <span className="hidden md:inline text-[11px] text-muted-foreground whitespace-nowrap">{zustaendig}</span>}
      {betrag !== undefined && <span className="tabular-nums font-semibold whitespace-nowrap w-24 text-right">{fmtEUR(betrag)}</span>}
      {link ? (
        <Link to={link} className="text-muted-foreground hover:text-foreground" title="Dort erledigen"><ArrowUpRight className="w-4 h-4" /></Link>
      ) : <span className="w-4" />}
    </div>
  );
}

const ART_TEXT = { vertrag: 'Retainer/Vertrag', anweisung: 'Anweisung', regie: 'Regie/Support', etappe: 'Etappe' };

// ── Diese Woche ────────────────────────────────────────────────────────────
export function DieseWoche({ liste, onStatus, onKontostand }) {
  const [erledigt, umschalten] = useErledigt(liste.von);
  const sum = (arr, f) => arr.reduce((s, x) => s + (Number(x[f]) || 0), 0);
  const anzahlGesamt = liste.fakturieren.length + liste.mahnen.length + liste.klaeren.length + liste.etappen.length + (liste.kontostand ? 1 : 0);
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-baseline justify-between px-4 py-3 border-b">
        <div>
          <p className="text-sm font-bold">Diese Woche · KW {liste.kw}</p>
          <p className="text-[11px] text-muted-foreground">{kurz(liste.von)}–{kurz(liste.bis)} · was zu tun ist, damit das Geld wie geplant kommt · Häkchen gelten nur diese Woche</p>
        </div>
        <span className="text-xs text-muted-foreground">{anzahlGesamt} Punkte</span>
      </div>

      {liste.kontostand && (
        <Gruppe titel="Kontostand" anzahl={1}>
          <Zeile id="kontostand" erledigt={erledigt} onToggle={umschalten} zustaendig="Geschäftsführung">
            <p className="font-medium">Auszug beim Verwalter anfordern und eintragen</p>
            <p className="text-muted-foreground">Letzter Stand {liste.kontostand.datum ? fmtDate(liste.kontostand.datum) : '—'}{liste.kontostand.alterTage !== null ? ` · ${liste.kontostand.alterTage} Tage alt` : ''}</p>
          </Zeile>
          <Button size="sm" variant="outline" className="mt-2" onClick={onKontostand}><Landmark className="w-3.5 h-3.5" />Kontostand eintragen</Button>
        </Gruppe>
      )}

      <Gruppe titel="Fakturieren" anzahl={liste.fakturieren.length} summe={sum(liste.fakturieren, 'netto')}
        erklaerung="Netto. Rechnungsdatum in dieser Woche oder schon vorbei – der Pfeil führt dorthin, wo die Rechnung entsteht.">
        {liste.fakturieren.map((f) => (
          <Zeile key={f.id} id={f.id} erledigt={erledigt} onToggle={umschalten} betrag={f.netto} zustaendig={f.zustaendig} link={f.link}>
            <p className="font-medium truncate">{f.kunde && f.art !== 'regie' ? `${f.kunde} · ` : ''}{f.label}</p>
            <p className="text-muted-foreground truncate">{ART_TEXT[f.art] || f.art} · Rechnung {fmtDate(f.datum)}{f.hinweis ? ` · ${f.hinweis}` : ''}</p>
          </Zeile>
        ))}
      </Gruppe>

      <Gruppe titel="Mahnen" anzahl={liste.mahnen.length} summe={sum(liste.mahnen, 'betrag')} offen={liste.mahnen.length <= 12}
        erklaerung="Überfällige Rechnungen ab 24.07., älteste zuerst. Brutto.">
        {liste.mahnen.map((m) => (
          <Zeile key={m.id} id={m.id} erledigt={erledigt} onToggle={umschalten} betrag={m.betrag} zustaendig={m.zustaendig} link={m.link}>
            <p className="font-medium truncate">{m.kunde} · {m.label}</p>
            <p className={m.tageUeber > 30 ? 'text-red-600' : 'text-muted-foreground'}>
              fällig {fmtDate(m.faellig)} · {m.tageUeber} Tage überfällig · {m.mahnstufe ? `zuletzt: ${m.mahnstufe}` : 'noch nicht gemahnt'}
            </p>
          </Zeile>
        ))}
      </Gruppe>

      <Gruppe titel="Klären" anzahl={liste.klaeren.length} summe={sum(liste.klaeren, 'betrag')}
        erklaerung="Zahlung unklar oder Rechnung auffällig. Status hier setzen, sobald es geklärt ist.">
        {liste.klaeren.map((k) => (
          <Zeile key={k.id} id={k.id} erledigt={erledigt} onToggle={umschalten} betrag={k.betrag} zustaendig={k.zustaendig}>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium truncate">{k.kunde} · {k.label}</p>
              <Select value={k.liqStatus} onValueChange={(v) => onStatus(k.rechnungId, v)}>
                <SelectTrigger className="h-6 text-[11px] w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(LIQ_STATUS_LABELS).map(([kk, l]) => <SelectItem key={kk} value={kk}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {k.notiz && <p className="text-muted-foreground">{k.notiz}</p>}
          </Zeile>
        ))}
      </Gruppe>

      <Gruppe titel="Etappen freigeben und Lieferung sichern" anzahl={liste.etappen.length} summe={sum(liste.etappen, 'netto')}
        erklaerung="Netto. Verzögerte oder nicht besetzte Etappen und alles, was bis nächste Woche verrechnet werden soll – je Sprint zusammengefasst.">
        {liste.etappen.map((g) => (
          <Zeile key={g.id} id={g.id} erledigt={erledigt} onToggle={umschalten} betrag={g.netto} zustaendig={`PL ${g.pl}`} link={g.link}>
            <p className="font-medium truncate">{g.kunde} · {g.titel}</p>
            <p className="text-muted-foreground">
              {g.positionen} {g.positionen === 1 ? 'Etappe' : 'Etappen'}{g.verzoegert ? `, davon ${g.verzoegert} verzögert` : ''} · {g.status.join(', ')}
              {g.restStunden ? ` · noch ${g.restStunden.toFixed(0)} h` : ''}{g.beiDir ? ` · ${g.beiDir.toFixed(0)} h bei dir` : ''}
            </p>
          </Zeile>
        ))}
      </Gruppe>
    </Card>
  );
}

// ── Monatsblick ────────────────────────────────────────────────────────────
export function Monatsblick({ monate, onZiele }) {
  const zeilen = [
    ['Mindest-Fakturierung', 'kostenOhneUst', 'Auszahlungen des Monats ohne Umsatzsteuer (Näherung)'],
    ['bereits fakturiert', 'fakturiert', 'Rechnungen aus sevDesk mit Rechnungsdatum im Monat'],
    ['geplant aus Bestand', 'geplant', 'Retainer ohne Rechnung, Etappen, Anweisungen, Regie'],
    ['gesichert', 'gesichert', null],
    ['Lücke = Neugeschäft nötig', 'luecke', null],
    ['Ziel Neugeschäft', 'ziel', 'von dir gesetzt'],
    ['Pipeline gewichtet', 'pipeline', 'offene Deals mit Abschluss im Monat × Wahrscheinlichkeit – nur Information'],
  ];
  return (
    <Card className="p-0 overflow-x-auto">
      <div className="flex items-baseline justify-between px-4 py-3 border-b">
        <div>
          <p className="text-sm font-bold">Monatsblick · Fakturierung netto</p>
          <p className="text-[11px] text-muted-foreground">Was fakturiert werden muss, damit der Stand hält – und wie viel davon schon gesichert ist.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onZiele}>Ziele bearbeiten</Button>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left px-4 py-1.5 font-medium" />
            {monate.map((m) => <th key={m.monat} className="text-right px-3 py-1.5 font-medium">{monthLabel(m.monat)}</th>)}
          </tr>
        </thead>
        <tbody>
          {zeilen.map(([label, feld, erklaerung]) => (
            <tr key={feld} className={`border-b border-border/40 ${feld === 'gesichert' ? 'font-semibold' : ''} ${feld === 'luecke' ? 'font-bold' : ''}`}>
              <td className="px-4 py-1.5">
                {label}{erklaerung && <span className="block text-[10px] font-normal text-muted-foreground">{erklaerung}</span>}
              </td>
              {monate.map((m) => {
                const wert = m[feld];
                const rot = feld === 'luecke' && wert > 0;
                return (
                  <td key={m.monat} className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${rot ? 'text-red-600' : ''} ${feld === 'pipeline' ? 'text-muted-foreground' : ''}`}>
                    {wert ? fmtEUR(wert) : <span className="text-muted-foreground/50">–</span>}
                    {feld === 'gesichert' && m.deckung !== null && <span className="block text-[10px] font-normal text-muted-foreground">{m.deckung} % gedeckt</span>}
                    {feld === 'pipeline' && m.pipelineAnzahl > 0 && <span className="block text-[10px]">{m.pipelineAnzahl} Deals</span>}
                    {feld === 'ziel' && m.ziel > 0 && m.luecke > 0 && <span className={`block text-[10px] font-normal ${m.ziel >= m.luecke ? 'text-emerald-700' : 'text-amber-700'}`}>{m.ziel >= m.luecke ? 'deckt die Lücke' : `${fmtEUR(m.luecke - m.ziel)} zu wenig`}</span>}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function ZieleDialog({ open, monate, einstellungZeilen, onClose, onGespeichert }) {
  const [werte, setWerte] = useState({});
  const [speichert, setSpeichert] = useState(false);
  useEffect(() => {
    if (!open) return;
    const w = {}; monate.forEach((m) => { w[m.monat] = m.ziel ? String(m.ziel).replace('.', ',') : ''; });
    setWerte(w);
  }, [open, monate]);
  const speichern = async () => {
    setSpeichert(true);
    const bisher = (() => { try { return JSON.parse((einstellungZeilen || []).find((s) => s.key === 'liquiditaet_ziele')?.value || '{}'); } catch { return {}; } })();
    const neu = { ...bisher };
    Object.entries(werte).forEach(([mk, v]) => {
      const zahl = Number(String(v).replace(/\./g, '').replace(',', '.')) || 0;
      if (zahl > 0) neu[mk] = zahl; else delete neu[mk];
    });
    try {
      await speichereEinstellung(einstellungZeilen, 'ziele', neu, 'Liquidität: Ziel Neugeschäft netto je Monat');
      onGespeichert(); onClose();
    } finally { setSpeichert(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Ziel Neugeschäft je Monat</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Netto-Fakturierung aus neuen Aufträgen, die du dir für den Monat vornimmst. Wird nicht als Eingang gerechnet.</p>
        <div className="space-y-2">
          {monate.map((m) => (
            <div key={m.monat} className="flex items-center gap-3">
              <span className="text-xs w-20">{monthLabel(m.monat)}</span>
              <Input inputMode="decimal" value={werte[m.monat] ?? ''} onChange={(e) => setWerte((w) => ({ ...w, [m.monat]: e.target.value }))} placeholder="0" />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Lieferfähigkeit ────────────────────────────────────────────────────────
const LIEFER_FARBE = {
  freigegeben: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  freigabe_fehlt: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  in_arbeit: 'text-foreground bg-muted/40 border-border',
  wartet: 'text-amber-700 bg-amber-50 border-amber-200',
  unbesetzt: 'text-red-700 bg-red-50 border-red-200',
  keine_aufgaben: 'text-red-700 bg-red-50 border-red-200',
};

export function Lieferung({ l }) {
  if (!l) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
      <span className={`border rounded px-1 font-semibold ${LIEFER_FARBE[l.status] || ''}`}>{l.label}</span>
      <span className="text-muted-foreground">PL {l.pl}</span>
      {l.aufgabenGesamt > 0 && <span className="text-muted-foreground">· {l.aufgabenOffen}/{l.aufgabenGesamt} Aufgaben offen · noch {l.restStunden.toFixed(1).replace('.', ',')} h</span>}
      {l.jePerson.map((p) => (
        <span key={p.email} className={`border rounded px-1 ${p.verfuegbar ? 'text-muted-foreground' : 'text-red-700 border-red-200 bg-red-50'}`}
          title={p.verfuegbar ? '' : (p.bis ? `verfügbar bis ${fmtDate(p.bis)}` : 'nicht aktiv')}>
          {p.name} {p.stunden.toFixed(0)} h{p.verfuegbar ? '' : ' – nicht verfügbar'}
        </span>
      ))}
      {l.ohneZustaendige > 0 && <span className="border rounded px-1 text-red-700 border-red-200 bg-red-50">ohne Zuständige {l.ohneZustaendige.toFixed(0)} h</span>}
    </div>
  );
}

export function PersonenLast({ personen, onVerfuegbarkeit }) {
  return (
    <Card className="p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold">Offene Etappenstunden je Person</p>
        <Button size="sm" variant="outline" className="h-7" onClick={onVerfuegbarkeit}>Verfügbarkeit</Button>
      </div>
      <p className="text-[11px] text-muted-foreground mb-2">Reststunden aller nicht freigegebenen Etappen. Wer bis zum Rechnungstermin nicht verfügbar ist, verschiebt die Etappe um vier Wochen.</p>
      {personen.length === 0 ? <p className="text-xs text-muted-foreground">Keine offenen Etappenstunden.</p> : (
        <div className="space-y-1">
          {personen.map((p) => (
            <div key={p.email} className="flex items-center justify-between text-xs">
              <span className={p.istDu ? 'font-semibold' : ''}>{p.name}{p.istDu ? ' (du)' : ''}{p.bis ? <span className="text-red-700"> · verfügbar bis {fmtDate(p.bis)}</span> : ''}</span>
              <span className="tabular-nums">{p.stunden.toFixed(1).replace('.', ',')} h · {p.etappen} {p.etappen === 1 ? 'Etappe' : 'Etappen'}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export function VerfuegbarkeitDialog({ open, personen = [], einstellungen = {}, einstellungZeilen, onClose, onGespeichert }) {
  const [werte, setWerte] = useState({});
  const [speichert, setSpeichert] = useState(false);
  const aktive = personen.filter((p) => p.active !== false);
  useEffect(() => { if (open) setWerte({ ...(einstellungen.personal || {}) }); }, [open, einstellungen]);
  const speichern = async () => {
    setSpeichert(true);
    const neu = {};
    Object.entries(werte).forEach(([em, d]) => { if (d) neu[em] = d; });
    try {
      await speichereEinstellung(einstellungZeilen, 'personal', neu, 'Liquidität: Personen verfügbar bis (Austritt)');
      onGespeichert(); onClose();
    } finally { setSpeichert(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Verfügbarkeit</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Letzter Arbeitstag bei Austritt oder längerer Abwesenheit. Leer = verfügbar. Wirkt nur auf die Liquiditätsplanung.</p>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {aktive.map((p) => {
            const em = (p.email || '').toLowerCase();
            return (
              <div key={p.id} className="flex items-center gap-3">
                <span className="text-xs flex-1">{p.name}</span>
                <Input type="date" className="w-40" value={werte[em] || ''} onChange={(e) => setWerte((w) => ({ ...w, [em]: e.target.value }))} />
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
