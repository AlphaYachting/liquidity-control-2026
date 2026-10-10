import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { fmtStd, fmtQuote, NV_GRUND, TAETIGKEIT } from '@/lib/arbeitszeit/auswertung';
import { fmtDatum } from '@/lib/arbeitszeit/kalender';

// Detailansicht hinter der Kachel „Nicht verrechenbar“ (Arbeitszeitauswertung, nur Alfons):
// oben je Projekt, wer wie viel nicht verrechenbar gebucht hat — ein Klick filtert;
// darunter jede einzelne Buchung mit Datum, Person, Projekt, Dauer, Grund und Beschreibung.
// Die Daten sind dieselben, aus denen die Kachel rechnet (werteAus → nvBuchungen).

const ZEILEN_ANFANG = 100;
const uhrzeit = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : '');
const taetigkeitText = (k) => TAETIGKEIT.find((t) => t.key === k)?.label || '';
const sel = 'h-8 px-2 rounded border border-border bg-white text-meta max-w-[220px]';

export default function AzNichtVerrechenbar({ buchungen, onSchliessen }) {
  const [person, setPerson] = useState('');
  const [projekt, setProjekt] = useState('');
  const [grund, setGrund] = useState('');
  const [alle, setAlle] = useState(false);

  const personen = useMemo(() => {
    const m = new Map();
    buchungen.forEach((b) => m.set(b.personKey, b.personName));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'de'));
  }, [buchungen]);

  const gefiltert = useMemo(() => buchungen.filter((b) => (!person || b.personKey === person)
    && (!projekt || b.projektKey === projekt)
    && (!grund || b.grund === grund)), [buchungen, person, projekt, grund]);

  // Je Projekt: Summe, Anzahl, Personen mit ihren Stunden (berücksichtigt Person- und Grund-Filter)
  const jeProjekt = useMemo(() => {
    const m = {};
    buchungen.filter((b) => (!person || b.personKey === person) && (!grund || b.grund === grund)).forEach((b) => {
      const p = m[b.projektKey] || (m[b.projektKey] = { key: b.projektKey, label: b.projektLabel, minuten: 0, anzahl: 0, personen: {} });
      p.minuten += b.minuten;
      p.anzahl += 1;
      p.personen[b.personName] = (p.personen[b.personName] || 0) + b.minuten;
    });
    return Object.values(m).sort((a, b) => b.minuten - a.minuten);
  }, [buchungen, person, grund]);

  const summe = gefiltert.reduce((s, b) => s + b.minuten, 0);
  const summeProjekte = jeProjekt.reduce((s, p) => s + p.minuten, 0);
  const gruende = [...new Set(buchungen.map((b) => b.grund).filter(Boolean))];
  const gefiltertAktiv = person || projekt || grund;
  const sichtbar = alle ? gefiltert : gefiltert.slice(0, ZEILEN_ANFANG);

  return (
    <div className="bg-white rounded border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 pb-3 border-b border-border">
        <div>
          <h2 className="text-section font-bold uppercase tracking-tight">Nicht verrechenbar im Detail</h2>
          <p className="text-meta text-muted-foreground">
            {fmtStd(summe)} h in {gefiltert.length} {gefiltert.length === 1 ? 'Buchung' : 'Buchungen'}
            {gefiltertAktiv ? ' (gefiltert)' : ''} · Klick auf ein Projekt filtert die Liste
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select className={sel} value={person} onChange={(e) => setPerson(e.target.value)} aria-label="Person">
            <option value="">Alle Personen</option>
            {personen.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <select className={sel} value={projekt} onChange={(e) => setProjekt(e.target.value)} aria-label="Projekt">
            <option value="">Alle Projekte</option>
            {jeProjekt.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          {gruende.length > 0 && (
            <select className={sel} value={grund} onChange={(e) => setGrund(e.target.value)} aria-label="Grund">
              <option value="">Alle Gründe</option>
              {gruende.map((g) => <option key={g} value={g}>{NV_GRUND[g] || g}</option>)}
            </select>
          )}
          {gefiltertAktiv && (
            <button type="button" className="text-meta text-muted-foreground hover:underline" onClick={() => { setPerson(''); setProjekt(''); setGrund(''); }}>
              Filter zurücksetzen
            </button>
          )}
          <button type="button" onClick={onSchliessen} aria-label="Schließen" className="p-1.5 rounded hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!buchungen.length ? (
        <p className="p-6 text-center text-meta text-muted-foreground">Im Zeitraum gibt es keine nicht verrechenbaren Buchungen.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-body">
              <thead>
                <tr className="border-b border-border">
                  {['Projekt', 'Nicht verr. h', 'Anteil', 'Buchungen', 'Von wem'].map((s, i) => (
                    <th key={s} className={`text-label uppercase text-muted-foreground font-medium px-3 py-2 ${i && i < 4 ? 'text-right' : 'text-left'}`}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jeProjekt.map((p) => (
                  <tr key={p.key} onClick={() => setProjekt(projekt === p.key ? '' : p.key)}
                    className={`border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 ${projekt === p.key ? 'bg-muted' : ''}`}>
                    <td className="px-3 py-2 font-medium">{p.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtStd(p.minuten)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtQuote(summeProjekte ? p.minuten / summeProjekte : null)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.anzahl}</td>
                    <td className="px-3 py-2 text-meta">
                      {Object.entries(p.personen).sort((a, b) => b[1] - a[1]).map(([n, m]) => `${n} ${fmtStd(m)} h`).join(' · ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-border overflow-x-auto">
            <p className="px-4 pt-3 pb-1 text-label uppercase text-muted-foreground">Einzelne Buchungen</p>
            <table className="w-full text-body">
              <thead>
                <tr className="border-b border-border">
                  {['Datum', 'Person', 'Projekt', 'Dauer', 'Grund', 'Beschreibung'].map((s, i) => (
                    <th key={s} className={`text-label uppercase text-muted-foreground font-medium px-3 py-2 ${i === 3 ? 'text-right' : 'text-left'}`}>{s}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((b) => (
                  <tr key={b.id} className="border-b border-border last:border-0 align-top">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {fmtDatum(b.tag)}
                      {b.von && <span className="block text-meta text-muted-foreground">{uhrzeit(b.von)}{b.bis ? `–${uhrzeit(b.bis)}` : ''}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{b.personName}</td>
                    <td className="px-3 py-2">{b.projektLabel}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtStd(b.minuten)} h</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {b.quelle === 'awork' ? <span className="text-muted-foreground">aWork</span> : (NV_GRUND[b.grund] || b.grund)}
                    </td>
                    <td className="px-3 py-2 text-meta">
                      {b.beschreibung || <span className="text-muted-foreground">—</span>}
                      {b.taetigkeit && <span className="block text-muted-foreground">{taetigkeitText(b.taetigkeit)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {gefiltert.length > ZEILEN_ANFANG && (
              <button type="button" className="text-meta text-muted-foreground hover:underline px-4 py-3" onClick={() => setAlle(!alle)}>
                {alle ? `Nur die ersten ${ZEILEN_ANFANG} zeigen` : `Alle ${gefiltert.length} Buchungen zeigen`}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
