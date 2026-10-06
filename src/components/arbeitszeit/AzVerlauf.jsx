import React, { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { fmtStd } from '@/lib/arbeitszeit/auswertung';

const h = (m) => Math.round((m / 60) * 10) / 10;

// Soll als Linie, erfasste Zeit als Säule (verrechenbar unten, nicht verrechenbar oben)
export default function AzVerlauf({ verlauf, taeglich }) {
  const daten = useMemo(() => verlauf.map((v) => ({
    label: v.feiertag ? `${v.label} ✱` : v.label,
    feiertag: v.feiertag,
    soll: h(v.sollMin),
    verr: h(v.verrMin),
    nv: h(Math.max(0, v.erfasstMin - v.verrMin)),
  })), [verlauf]);

  if (!daten.length) return null;
  return (
    <div className="bg-white rounded border border-border p-4 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-section font-bold uppercase tracking-tight">Verlauf {taeglich ? 'je Tag' : 'je Kalenderwoche'}</h2>
        <span className="text-meta text-muted-foreground">Stunden, ganzes Team{daten.some((d) => d.feiertag) ? ' · ✱ Feiertag' : ''}</span>
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={daten} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip
              formatter={(v, name) => [`${fmtStd(v * 60)} h`, name]}
              labelFormatter={(l, p) => (p?.[0]?.payload?.feiertag ? `${l} · ${p[0].payload.feiertag}` : l)}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="verr" name="Verrechenbar" stackId="e" fill="hsl(var(--chart-2))" />
            <Bar dataKey="nv" name="Nicht verrechenbar" stackId="e" fill="hsl(var(--muted-foreground) / 0.45)" />
            <Line dataKey="soll" name="Soll" type="step" stroke="hsl(var(--foreground))" strokeDasharray="4 3" dot={false} strokeWidth={1.5} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
