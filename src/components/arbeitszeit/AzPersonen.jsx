import React, { useMemo, useState } from 'react';
import { fmtStd, fmtQuote, TAETIGKEIT } from '@/lib/arbeitszeit/auswertung';

const zelle = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

// Balken für die Erfassungsquote — die Marke steht bei 100 % Soll
function QuoteBalken({ q }) {
  if (q === null) return <span className="text-muted-foreground">—</span>;
  const breite = Math.min(q, 1.25) / 1.25;
  const farbe = q < 0.8 ? 'hsl(var(--destructive))' : q < 0.95 ? 'hsl(var(--chart-4))' : 'hsl(var(--chart-2))';
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className="w-10 text-right">{fmtQuote(q)}</span>
      <div className="relative w-20 h-2 rounded bg-muted">
        <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${breite * 100}%`, background: farbe }} />
        <div className="absolute -top-0.5 -bottom-0.5 w-px bg-foreground" style={{ left: `${(1 / 1.25) * 100}%` }} />
      </div>
    </div>
  );
}

function TaetigkeitBalken({ werte, gesamt }) {
  if (!gesamt) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex w-24 h-2 rounded overflow-hidden bg-muted ml-auto"
      title={TAETIGKEIT.map((t) => `${t.label} ${fmtStd(werte[t.key])} h`).join(' · ')}>
      {TAETIGKEIT.map((t) => <div key={t.key} style={{ width: `${Math.max(0, werte[t.key] / gesamt) * 100}%`, background: t.farbe }} />)}
    </div>
  );
}

function SollEingabe({ person, standard, onSpeichern }) {
  const [wert, setWert] = useState(person.individuell ? String(person.wochenStd) : '');
  if (!person.aktiv) return <span className="text-muted-foreground">—</span>;
  const fertig = () => {
    const neu = wert.trim().replace(',', '.');
    const alt = person.individuell ? String(person.wochenStd) : '';
    if (neu === alt) return;
    if (neu !== '' && !Number.isFinite(Number(neu))) { setWert(alt); return; }
    onSpeichern(person.key, neu === '' ? '' : Number(neu));
  };
  return (
    <input
      className="w-16 h-7 rounded border border-border bg-white px-1.5 text-right text-meta tabular-nums"
      inputMode="decimal"
      placeholder={String(standard)}
      value={wert}
      onChange={(e) => setWert(e.target.value)}
      onBlur={fertig}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      aria-label={`Sollstunden je Woche für ${person.name}`}
      title="Leer = Standard. Für Teilzeit die Wochenstunden eintragen."
    />
  );
}

const SPALTEN = [
  { key: 'name', label: 'Person', links: true },
  { key: 'wochenStd', label: 'Soll h/Woche' },
  { key: 'sollTage', label: 'Arbeitstage' },
  { key: 'abwesendTage', label: 'Abwesend' },
  { key: 'sollMin', label: 'Soll h' },
  { key: 'erfasstMin', label: 'Erfasst h' },
  { key: 'saldoMin', label: 'Differenz' },
  { key: 'erfassungsquote', label: 'Erfasst/Soll' },
  { key: 'schnittTag', label: 'Ø je Tag' },
  { key: 'verrMin', label: 'Verrechenbar h' },
  { key: 'verrQuote', label: 'Anteil verr.' },
  { key: 'produktiv', label: 'Verr./Soll' },
  { key: 'nvMin', label: 'Nicht verr. h' },
  { key: 'mehrMin', label: 'Mehraufwand h' },
  { key: 'offeneTage', label: 'Offene Tage' },
  { key: 'taetigkeit', label: 'Tätigkeit', ohneSort: true },
];

export default function AzPersonen({ personen, standardWoche, onSollSpeichern, mitApp }) {
  const [sort, setSort] = useState({ key: 'name', ab: false });
  const sortiert = useMemo(() => {
    const liste = [...personen];
    liste.sort((a, b) => {
      if (a.aktiv !== b.aktiv) return a.aktiv ? -1 : 1;
      const x = a[sort.key], y = b[sort.key];
      const r = typeof x === 'string' ? x.localeCompare(y, 'de') : (x ?? -Infinity) - (y ?? -Infinity);
      return sort.ab ? -r : r;
    });
    return liste;
  }, [personen, sort]);
  const klick = (s) => { if (!s.ohneSort) setSort((alt) => ({ key: s.key, ab: alt.key === s.key ? !alt.ab : s.key !== 'name' })); };

  return (
    <div className="bg-white rounded border border-border overflow-x-auto">
      <table className="w-full text-body">
        <thead>
          <tr className="border-b border-border">
            {SPALTEN.map((s) => (
              <th key={s.key} className={`text-label uppercase text-muted-foreground font-medium px-3 py-2 whitespace-nowrap ${s.links ? 'text-left' : 'text-right'} ${s.ohneSort ? '' : 'cursor-pointer select-none hover:text-foreground'}`}
                onClick={() => klick(s)} aria-sort={sort.key === s.key ? (sort.ab ? 'descending' : 'ascending') : undefined}>
                {s.label}{sort.key === s.key ? (sort.ab ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortiert.map((p) => (
            <tr key={p.key} className={`border-b border-border last:border-0 ${p.aktiv ? '' : 'text-muted-foreground'}`}>
              <td className="px-3 py-2 whitespace-nowrap font-medium">
                {p.name}
                {!p.aktiv && <span className="ml-2 text-meta">{p.key.startsWith('awork:') ? 'nur aWork, nicht zugeordnet' : 'nicht aktiv'}</span>}
              </td>
              <td className={zelle}><SollEingabe key={`${p.key}-${p.wochenStd}`} person={p} standard={standardWoche} onSpeichern={onSollSpeichern} /></td>
              <td className={zelle}>{p.aktiv ? p.sollTage : '—'}</td>
              <td className={zelle}>{p.aktiv ? (p.abwesendTage || '–') : '—'}</td>
              <td className={zelle}>{p.aktiv ? fmtStd(p.sollMin) : '—'}</td>
              <td className={`${zelle} font-medium`}>{fmtStd(p.erfasstMin)}</td>
              <td className={zelle} style={{ color: p.saldoMin < -60 ? 'hsl(var(--destructive))' : undefined }}>
                {p.saldoMin === null ? '—' : `${p.saldoMin > 0 ? '+' : ''}${fmtStd(p.saldoMin)}`}
              </td>
              <td className={zelle}><QuoteBalken q={p.erfassungsquote} /></td>
              <td className={zelle}>{p.schnittTag === null ? '—' : fmtStd(p.schnittTag)}</td>
              <td className={zelle}>{fmtStd(p.verrMin)}</td>
              <td className={zelle}>{fmtQuote(p.verrQuote)}</td>
              <td className={zelle}>{fmtQuote(p.produktiv)}</td>
              <td className={zelle}>{fmtStd(p.nvMin)}</td>
              <td className={zelle}>{mitApp ? fmtStd(p.mehrMin) : '—'}</td>
              <td className={zelle} style={{ color: p.offeneTage ? 'hsl(var(--destructive))' : undefined }}>{mitApp && p.aktiv ? (p.offeneTage || '–') : '—'}</td>
              <td className={zelle}><TaetigkeitBalken werte={p.taetigkeit} gesamt={p.erfasstMin > 0 ? p.taetigkeit.beratung + p.taetigkeit.umsetzung + p.taetigkeit.vertrieb : 0} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
