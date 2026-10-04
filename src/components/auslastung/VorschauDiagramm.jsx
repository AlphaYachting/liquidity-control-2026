import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ARTEN, LAUFEND } from '@/lib/auslastung/arbeitsart';
import { fmtH } from '@/lib/auslastung/auslastungRechnung';

const knopf = (aktiv) => `text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded border ${aktiv ? 'bg-foreground text-background border-foreground' : 'bg-white text-foreground border-border hover:bg-muted'}`;
const STAPEL = [...ARTEN.filter((a) => a.key === 'fix' || LAUFEND.includes(a.key)), { key: 'neu', label: 'Neue Fixprojekte', farbe: 'hsl(var(--foreground) / 0.35)' }];

function summe(personen, monate) {
  return monate.map((m, i) => {
    const z = { monat: m.label };
    STAPEL.forEach((s) => { z[s.key] = personen.reduce((acc, p) => acc + (p.reihe[i][s.key] || 0), 0); });
    return z;
  });
}

export default function VorschauDiagramm({ vorschau }) {
  const [sicht, setSicht] = useState('gesamt');
  const [person, setPerson] = useState('');
  const gewaehlt = vorschau.personen.find((p) => p.key === person) || vorschau.personen[0];
  const reihe = useMemo(() => {
    if (sicht === 'person') return gewaehlt ? gewaehlt.reihe : [];
    const liste = sicht === 'web' ? vorschau.personen.filter((p) => p.istWeb) : vorschau.personen;
    return summe(liste, vorschau.monate);
  }, [sicht, gewaehlt, vorschau]);

  return (
    <div className="bg-white rounded border border-border p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[['gesamt', 'Gesamt'], ['person', 'Je Person'], ['web', 'Nur Entwicklung']].map(([k, l]) => (
          <button key={k} type="button" className={knopf(sicht === k)} onClick={() => setSicht(k)}>{l}</button>
        ))}
        {sicht === 'person' && (
          <select className="h-8 rounded border border-border bg-white px-2 text-meta" value={gewaehlt?.key || ''} onChange={(e) => setPerson(e.target.value)}>
            {vorschau.personen.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
          </select>
        )}
      </div>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={reihe}>
            <XAxis dataKey="monat" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip formatter={(v) => `${fmtH(v)} h`} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {STAPEL.map((s) => <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.farbe} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}