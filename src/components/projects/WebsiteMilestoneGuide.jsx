import React, { useState } from 'react';
import { formatCurrency } from '@/lib/liquidityUtils';
import { ChevronDown, ChevronRight, MapPin } from 'lucide-react';

const MILESTONES = [
  { label: 'Positionierung abgeschlossen', target: 40, type: 'AZ', desc: '40% Anzahlung/Teilrechnung bei Abschluss der Positionierungsphase' },
  { label: 'Startseite Design / Look & Feel', target: 50, add: 10, type: 'TR', desc: '+10% Teilrechnung nach Freigabe Startseite' },
  { label: 'Gesamtdesign abgeschlossen', target: 70, type: 'TR', desc: '70% kumuliert bei Abschluss Gesamtdesign' },
  { label: 'Programmierungsphase', target: 90, add: 20, type: 'TR', desc: '+20% Teilrechnung bei Start/Fortschritt Programmierung' },
  { label: 'Programmierung fertig / QS Start', target: 100, add: 10, type: 'ER', desc: 'Schlussrechnung (+10%) bei Abschluss und QS-Start' },
];

/**
 * Task 10: Website project milestone billing guide.
 * Shows target billing % per milestone vs. actual billing %.
 */
export default function WebsiteMilestoneGuide({ billingPct = 0, commercialBaseNet = 0 }) {
  const [open, setOpen] = useState(false);

  const currentMilestone = MILESTONES.reduce((found, m) => {
    if (billingPct >= m.target) return m;
    return found;
  }, null);

  const nextMilestone = MILESTONES.find(m => m.target > billingPct);
  const gap = nextMilestone ? nextMilestone.target - billingPct : 0;

  return (
    <div className="border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
          <span className="text-sm font-medium">Website-Meilenstein-Leitfaden</span>
          {nextMilestone && gap > 5 && (
            <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 rounded px-1.5 py-0 font-medium">
              Nächster Meilenstein: {nextMilestone.label} ({nextMilestone.target}%)
            </span>
          )}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t px-4 py-3 space-y-2 bg-muted/10">
          <p className="text-xs text-muted-foreground mb-3">
            Empfohlene Abrechnungsstruktur für Website-Projekte. Dient als Orientierung — keine automatische Verrechnung.
          </p>
          {MILESTONES.map((m, i) => {
            const achieved = billingPct >= m.target;
            const isCurrent = !achieved && (i === 0 || billingPct >= MILESTONES[i - 1]?.target);
            const amountTarget = commercialBaseNet > 0 ? (commercialBaseNet * m.target) / 100 : null;
            const addAmount = commercialBaseNet > 0 && m.add ? (commercialBaseNet * m.add) / 100 : null;
            return (
              <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border text-xs ${
                achieved ? 'border-emerald-200 bg-emerald-50/50' :
                isCurrent ? 'border-primary/40 bg-primary/5' :
                'border-border bg-transparent opacity-60'
              }`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold ${
                  achieved ? 'bg-emerald-500 text-white' :
                  isCurrent ? 'bg-primary text-white' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {achieved ? '✓' : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${isCurrent ? 'text-primary' : ''}`}>{m.label}</p>
                  <p className="text-muted-foreground mt-0.5">{m.desc}</p>
                </div>
                <div className="text-right flex-shrink-0 space-y-0.5">
                  <p className={`font-bold ${achieved ? 'text-emerald-600' : isCurrent ? 'text-primary' : ''}`}>
                    {m.target}% kum.
                  </p>
                  {m.add && <p className="text-muted-foreground">+{m.add}%</p>}
                  <span className={`inline-block text-xs px-1.5 py-0 rounded font-medium ${
                    m.type === 'AZ' ? 'bg-purple-100 text-purple-700' :
                    m.type === 'ER' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>{m.type}</span>
                  {amountTarget && <p className="text-muted-foreground">{formatCurrency(amountTarget)}</p>}
                </div>
              </div>
            );
          })}
          {gap > 5 && nextMilestone && (
            <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              ⚠ Abrechnungsstand ({Math.round(billingPct)}%) liegt {Math.round(gap)}% unter dem Meilenstein-Ziel ({nextMilestone.target}%)
            </div>
          )}
        </div>
      )}
    </div>
  );
}