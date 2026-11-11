import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import Seitenkopf from '@/components/shared/Seitenkopf';
import Kennzahlleiste from '@/components/shared/Kennzahlleiste';
import StatusEtikett from '@/components/shared/StatusEtikett';
import { Box, BoxKopf } from '@/components/shared/Box';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TON_STREIFEN, TON_TEXT } from '@/lib/designTon';
import { bewerteKunde, TON_LABEL, TON_RANG } from '@/lib/omKpi/signale';

// OM-Kennzahlen (Prototyp 11.11.2026): je Online-Marketing-Kunde die Zahlen von gestern,
// verglichen mit dem Schnitt der sieben Tage davor, mit Ampel und Klartext-Hinweis.
// Die Seite liest nur OmKpiTag und OmKundenKonto — der Frühlauf schreibt die Zahlen vorher.

const zahl = (v, stellen = 0) =>
  v == null ? '—' : new Intl.NumberFormat('de-AT', { maximumFractionDigits: stellen, minimumFractionDigits: 0 }).format(v);
const eur = (v, stellen = 0) =>
  v == null ? '—' : new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: stellen, minimumFractionDigits: stellen }).format(v);
const delta = (wert, schnitt) => {
  if (wert == null || !schnitt) return null;
  const p = Math.round((wert / schnitt - 1) * 100);
  return `${p > 0 ? '+' : ''}${p} %`;
};
const datumLang = (iso) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const datumKurz = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '');
const uhrzeit = (iso) =>
  iso ? new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const REITER = [
  { key: 'handeln', label: 'Handlungsbedarf', passt: (z) => z.ton === 'critical' || z.ton === 'attention' },
  { key: 'alle', label: 'Alle Kunden', passt: () => true },
  { key: 'ohne', label: 'Ohne Daten', passt: (z) => !z.hatDaten },
];

function Messwert({ titel, wert, vergleich }) {
  return (
    <div className="text-right min-w-0">
      <p className="text-label uppercase text-muted-foreground truncate">{titel}</p>
      <p className="text-value tabular-nums text-foreground">{wert}</p>
      <p className="text-meta text-muted-foreground tabular-nums h-4">{vergleich || ''}</p>
    </div>
  );
}

function Quellblock({ titel, hinweis, zeilen }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <p className="text-label uppercase text-muted-foreground">{titel}</p>
        {hinweis && <p className="text-meta text-muted-foreground truncate">{hinweis}</p>}
      </div>
      <table className="w-full text-body tabular-nums">
        <thead>
          <tr className="text-meta text-muted-foreground">
            <th className="text-left font-normal py-1" />
            <th className="text-right font-normal py-1">Wert</th>
            <th className="text-right font-normal py-1">Ø 7 Tage</th>
            <th className="text-right font-normal py-1 w-14">Δ</th>
          </tr>
        </thead>
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.label} className="border-t">
              <td className="py-1.5 text-muted-foreground">{z.label}</td>
              <td className="py-1.5 text-right text-foreground">{z.wert}</td>
              <td className="py-1.5 text-right text-muted-foreground">{z.schnitt ?? ''}</td>
              <td className="py-1.5 text-right text-muted-foreground">{z.delta ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Details({ z }) {
  const { tag, konto } = z;
  const { ads, ga4, gsc } = tag;
  return (
    <div className="px-4 pb-4 pt-1 space-y-4 bg-muted/20">
      {z.signale.length > 0 && (
        <ul className="space-y-1">
          {z.signale.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-body">
              <span className={cn('mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-current', TON_TEXT[s.ton] || 'text-muted-foreground')} />
              <span className="text-foreground">{s.text}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-5 md:grid-cols-3">
        {ads ? (
          <Quellblock
            titel="Google Ads"
            hinweis={konto?.google_ads_customer_id ? `Konto ${konto.google_ads_customer_id.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}` : null}
            zeilen={[
              { label: 'Kosten', wert: eur(ads.kosten, 2), schnitt: eur(ads.kosten_7t_schnitt, 2), delta: delta(ads.kosten, ads.kosten_7t_schnitt) },
              { label: 'Klicks', wert: zahl(ads.klicks), schnitt: zahl(ads.klicks_7t_schnitt, 1), delta: delta(ads.klicks, ads.klicks_7t_schnitt) },
              { label: 'Conversions', wert: zahl(ads.conversions, 1), schnitt: zahl(ads.conversions_7t_schnitt, 1), delta: delta(ads.conversions, ads.conversions_7t_schnitt) },
              { label: 'CPA', wert: ads.cpa ? eur(ads.cpa, 2) : '—' },
              { label: 'CTR', wert: ads.ctr != null ? `${zahl(ads.ctr, 2)} %` : '—' },
              { label: 'Monat bisher', wert: eur(ads.kosten_monat), schnitt: konto?.monatsbudget_ads ? `Budget ${eur(konto.monatsbudget_ads)}` : null },
              { label: 'Conv. Monat', wert: zahl(ads.conversions_monat, 1) },
            ]}
          />
        ) : <p className="text-meta text-muted-foreground">Kein Google-Ads-Konto zugeordnet</p>}
        {ga4 ? (
          <Quellblock
            titel="Google Analytics 4"
            hinweis={konto?.ga4_property_id ? `Property ${konto.ga4_property_id}` : null}
            zeilen={[
              { label: 'Sitzungen', wert: zahl(ga4.sitzungen), schnitt: zahl(ga4.sitzungen_7t_schnitt, 1), delta: delta(ga4.sitzungen, ga4.sitzungen_7t_schnitt) },
              { label: 'Key Events', wert: zahl(ga4.key_events), schnitt: zahl(ga4.key_events_7t_schnitt, 1), delta: delta(ga4.key_events, ga4.key_events_7t_schnitt) },
            ]}
          />
        ) : <p className="text-meta text-muted-foreground">Keine GA4-Property zugeordnet</p>}
        {gsc ? (
          <Quellblock
            titel="Search Console"
            hinweis={`Stand ${datumKurz(gsc.datum)}`}
            zeilen={[
              { label: 'Klicks', wert: zahl(gsc.klicks), schnitt: zahl(gsc.klicks_7t_schnitt, 1), delta: delta(gsc.klicks, gsc.klicks_7t_schnitt) },
              { label: 'Impressionen', wert: zahl(gsc.impressionen), schnitt: zahl(gsc.impressionen_7t_schnitt), delta: delta(gsc.impressionen, gsc.impressionen_7t_schnitt) },
              { label: 'Ø-Position', wert: zahl(gsc.position, 1), schnitt: zahl(gsc.position_7t_schnitt, 1) },
            ]}
          />
        ) : <p className="text-meta text-muted-foreground">Keine Search-Console-Property zugeordnet</p>}
      </div>
    </div>
  );
}

function KundenZeile({ z, offen, onToggle }) {
  const { ads, ga4, gsc } = z.tag;
  const erster = z.signale[0];
  const weitere = z.signale.length - 1;
  return (
    <div className={cn(TON_STREIFEN[z.ton])}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={offen}
        className="w-full grid items-center gap-3.5 px-4 py-3 text-left hover:bg-muted/40 grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_112px_repeat(4,92px)_16px]"
      >
        <div className="min-w-0">
          <p className="text-object text-foreground truncate">{z.tag.kunde}</p>
          <p className="text-meta text-muted-foreground truncate">
            {erster ? erster.text : 'Alle Werte im üblichen Rahmen'}
            {weitere > 0 && <span> · {weitere} weitere{weitere === 1 ? 'r' : ''} Hinweis{weitere === 1 ? '' : 'e'}</span>}
          </p>
        </div>
        <div><StatusEtikett ton={z.ton}>{TON_LABEL[z.ton]}</StatusEtikett></div>
        <div className="hidden md:block"><Messwert titel="Ads-Kosten" wert={ads ? eur(ads.kosten) : '—'} vergleich={ads ? delta(ads.kosten, ads.kosten_7t_schnitt) : null} /></div>
        <div className="hidden md:block"><Messwert titel="Conversions" wert={ads ? zahl(ads.conversions, 1) : '—'} vergleich={ads ? `Ø ${zahl(ads.conversions_7t_schnitt, 1)}` : null} /></div>
        <div className="hidden md:block"><Messwert titel="Sitzungen" wert={ga4 ? zahl(ga4.sitzungen) : '—'} vergleich={ga4 ? delta(ga4.sitzungen, ga4.sitzungen_7t_schnitt) : null} /></div>
        <div className="hidden md:block"><Messwert titel="Org. Klicks" wert={gsc ? zahl(gsc.klicks) : '—'} vergleich={gsc ? delta(gsc.klicks, gsc.klicks_7t_schnitt) : null} /></div>
        <ChevronRight className={cn('hidden md:block w-4 h-4 text-muted-foreground transition-transform', offen && 'rotate-90')} />
      </button>
      {offen && <Details z={z} />}
    </div>
  );
}

export default function OmKennzahlen() {
  const [reiter, setReiter] = useState('handeln');
  const [offen, setOffen] = useState(null);

  const { data: tage = [], isLoading: ladeTage } = useQuery({
    queryKey: ['om-kpi-tage'],
    queryFn: () => base44.entities.OmKpiTag.list('-stichtag', 500),
  });
  const { data: konten = [], isLoading: ladeKonten } = useQuery({
    queryKey: ['om-kunden-konten'],
    queryFn: () => base44.entities.OmKundenKonto.list(),
  });

  const { zeilen, stichtag, abgerufen, gscDatum } = useMemo(() => {
    const letzter = tage.reduce((max, t) => (t.stichtag > max ? t.stichtag : max), '');
    const kontoNachId = Object.fromEntries(konten.map((k) => [k.id, k]));
    const aktuelle = tage.filter((t) => t.stichtag === letzter && kontoNachId[t.konto_id]?.aktiv !== false);
    const liste = aktuelle
      .map((tag) => {
        const konto = kontoNachId[tag.konto_id];
        return { tag, konto, ...bewerteKunde(tag, konto) };
      })
      .sort((a, b) => TON_RANG[b.ton] - TON_RANG[a.ton] || (b.tag.ads?.kosten || 0) - (a.tag.ads?.kosten || 0));
    return {
      zeilen: liste,
      stichtag: letzter,
      abgerufen: aktuelle.reduce((max, t) => (t.abgerufen_am > max ? t.abgerufen_am : max), ''),
      gscDatum: aktuelle.reduce((max, t) => (t.gsc?.datum > max ? t.gsc.datum : max), ''),
    };
  }, [tage, konten]);

  const zaehle = (ton) => zeilen.filter((z) => z.ton === ton).length;
  const summe = (f) => zeilen.reduce((s, z) => s + (f(z.tag) || 0), 0);
  const aktiv = REITER.find((r) => r.key === reiter) || REITER[0];
  const liste = zeilen.filter(aktiv.passt);

  if (ladeTage || ladeKonten) {
    return <div className="max-w-[1200px] space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-20" /><Skeleton className="h-[420px]" /></div>;
  }

  return (
    <div className="max-w-[1200px] space-y-4">
      <Seitenkopf
        bereich="Online-Marketing"
        titel="Kennzahlen"
        kontext={stichtag
          ? `Zahlen von ${datumLang(stichtag)} · abgerufen ${uhrzeit(abgerufen)}${gscDatum ? ` · Search Console mit Verzug, Stand ${datumKurz(gscDatum)}` : ''}`
          : 'Noch keine Zahlen abgerufen'}
        aktionen={<Link to="/online-marketing" className="text-meta text-muted-foreground hover:text-foreground">Verträge & Retainer</Link>}
      />

      <Kennzahlleiste
        werte={[
          { label: 'Handeln', wert: zaehle('critical'), ton: zaehle('critical') ? 'critical' : undefined, hinweis: 'Kunden', onClick: () => setReiter('handeln') },
          { label: 'Beobachten', wert: zaehle('attention'), ton: zaehle('attention') ? 'attention' : undefined, hinweis: 'Kunden', onClick: () => setReiter('handeln') },
          { label: 'Unauffällig', wert: zaehle('done'), ton: 'done', hinweis: 'Kunden', onClick: () => setReiter('alle') },
          { label: 'Ads-Kosten gestern', wert: eur(summe((t) => t.ads?.kosten)), hinweis: `Ø ${eur(summe((t) => t.ads?.kosten_7t_schnitt))} am Tag` },
          { label: 'Ads-Conversions gestern', wert: zahl(summe((t) => t.ads?.conversions), 1), hinweis: `Ø ${zahl(summe((t) => t.ads?.conversions_7t_schnitt), 1)} am Tag` },
        ]}
      />

      <div className="flex gap-1 border-b overflow-x-auto">
        {REITER.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => { setReiter(r.key); setOffen(null); }}
            className={cn(
              'h-[38px] px-3 -mb-px border-b-2 text-body font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0',
              reiter === r.key ? 'border-foreground text-foreground font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {r.label}
            <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-muted text-muted-foreground text-[11px] font-semibold inline-flex items-center justify-center">
              {zeilen.filter(r.passt).length}
            </span>
          </button>
        ))}
      </div>

      <Box>
        <BoxKopf titel={aktiv.label} zaehler={liste.length} hinweis="Gestern gegen den Schnitt der 7 Tage davor · Zeile öffnen für Details" />
        {liste.length === 0 ? (
          <p className="px-4 py-8 text-body text-muted-foreground">
            {reiter === 'handeln' ? 'Kein Kunde braucht heute Aufmerksamkeit.' : 'Keine Kunden in dieser Ansicht.'}
          </p>
        ) : (
          <div className="divide-y">
            {liste.map((z) => (
              <KundenZeile
                key={z.tag.id}
                z={z}
                offen={offen === z.tag.id}
                onToggle={() => setOffen(offen === z.tag.id ? null : z.tag.id)}
              />
            ))}
          </div>
        )}
      </Box>
    </div>
  );
}
