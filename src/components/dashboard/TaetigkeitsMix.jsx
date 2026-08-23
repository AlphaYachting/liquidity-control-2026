import React, { useMemo } from 'react';

const TAETIGKEITEN = ['beratung', 'vertrieb', 'umsetzung'];
const LABEL = { beratung: 'Beratung', vertrieb: 'Vertrieb', umsetzung: 'Umsetzung' };
const FARBE = { beratung: 'hsl(var(--chart-1))', vertrieb: 'hsl(var(--chart-3))', umsetzung: 'hsl(var(--chart-2))' };

const fmtH = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')} h`;

const Balken = ({ name, s, hinweis }) => (
  <div>
    <div className="flex items-center justify-between text-xs mb-1">
      <span className="font-medium text-foreground">{name}</span>
      <span className="text-muted-foreground tabular-nums">
        {fmtH(s.gesamt)}
        {hinweis && <span className="ml-2 text-amber-600 font-semibold">Vertrieb {Math.round((s.vertrieb / s.gesamt) * 100)} %</span>}
      </span>
    </div>
    <div className="flex h-2 rounded-full overflow-hidden bg-muted">
      {TAETIGKEITEN.map((k) => s[k] > 0 && (
        <div key={k} style={{ width: `${(s[k] / s.gesamt) * 100}%`, backgroundColor: FARBE[k] }} />
      ))}
    </div>
  </div>
);

// Aufteilung der Tätigkeiten je Monat und Person. Ein Vertriebsanteil nahe null ist ein Befund.
export default function TaetigkeitsMix({ entries = [], month }) {
  const { gesamt, personen } = useMemo(() => {
    const leer = () => ({ beratung: 0, vertrieb: 0, umsetzung: 0, gesamt: 0 });
    const g = leer();
    const perPerson = {};
    for (const e of entries) {
      if (month && e.entry_month !== month) continue;
      const k = TAETIGKEITEN.includes(e.taetigkeit) ? e.taetigkeit : 'umsetzung';
      const min = Number(e.duration_minutes) || 0;
      g[k] += min; g.gesamt += min;
      const name = e.user_name || 'Unbekannt';
      if (!perPerson[name]) perPerson[name] = leer();
      perPerson[name][k] += min; perPerson[name].gesamt += min;
    }
    return {
      gesamt: g,
      personen: Object.entries(perPerson).filter(([, s]) => s.gesamt > 0).sort((a, b) => b[1].gesamt - a[1].gesamt),
    };
  }, [entries, month]);

  if (!gesamt.gesamt) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tätigkeiten</div>
        <div className="flex flex-wrap gap-3">
          {TAETIGKEITEN.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: FARBE[k] }} />
              {LABEL[k]} <span className="tabular-nums font-semibold text-foreground">{fmtH(gesamt[k])}</span>
            </span>
          ))}
        </div>
      </div>
      <Balken name="Gesamt" s={gesamt} hinweis={gesamt.vertrieb / gesamt.gesamt < 0.02} />
      <div className="space-y-2 border-t pt-3">
        {personen.map(([name, s]) => (
          <Balken key={name} name={name} s={s} hinweis={s.vertrieb / s.gesamt < 0.02} />
        ))}
      </div>
    </div>
  );
}