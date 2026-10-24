import React from 'react';
import { Check, MessageSquareHeart } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { tag } from '@/lib/neuigkeiten';

// Dank an die Person, deren Rückmeldung zur Neuerung geführt hat — im Fenster und im Archiv gleich
export function WunschVon({ von }) {
  if (!von) return null;
  return (
    <span
      className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 text-[11.5px] font-semibold"
      style={{ borderRadius: 999, color: RITTLER.pink, backgroundColor: 'hsl(var(--primary) / 0.08)' }}
    >
      <MessageSquareHeart className="w-3.5 h-3.5" />
      Wunsch von {von}
    </span>
  );
}

// Eine Ausgabe „Was ist neu".
//  variante "fenster": nummerierte Karten, die nacheinander einblenden (Begrüßungsfenster nach dem Update)
//  sonst: schlichte Liste mit Häkchen (Archiv und Vorschau)
export default function NeuigkeitInhalt({ ausgabe, kompakt = false, variante = 'liste', ohneKopf = false }) {
  const punkte = (ausgabe?.punkte || []).filter((p) => p?.text);

  const kopf = !ohneKopf && (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className={kompakt ? 'text-[14px] font-semibold' : 'text-[17px] font-semibold'} style={{ color: RITTLER.black }}>
        {ausgabe?.titel || 'Was ist neu'}
      </h3>
      {ausgabe?.veroeffentlicht_am && (
        <span className="text-[12px] shrink-0" style={{ color: RITTLER.textSecondary }}>{tag(ausgabe.veroeffentlicht_am)}</span>
      )}
    </div>
  );

  if (punkte.length === 0) {
    return (
      <div>
        {kopf}
        <p className="mt-2 text-[13px]" style={{ color: RITTLER.textSecondary }}>Noch keine Punkte.</p>
      </div>
    );
  }

  if (variante === 'fenster') {
    return (
      <div>
        {kopf}
        <ol className={`${ohneKopf ? '' : 'mt-3 '}space-y-2`}>
          {punkte.map((p, i) => (
            <li
              key={i}
              className="neu-einblenden flex gap-3 px-3.5 py-3 border bg-background"
              style={{ borderColor: RITTLER.line, borderRadius: 4, animationDelay: `${150 + i * 70}ms` }}
            >
              <span
                className="shrink-0 w-6 h-6 flex items-center justify-center text-[12px] font-bold tabular-nums"
                style={{ borderRadius: 999, backgroundColor: RITTLER.black, color: RITTLER.white }}
                aria-hidden="true"
              >
                {i + 1}
              </span>
              <span className="min-w-0 text-[13.5px] leading-snug pt-0.5" style={{ color: RITTLER.black }}>
                {p.text}
                {p.von && <span className="block"><WunschVon von={p.von} /></span>}
              </span>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div>
      {kopf}
      <ul className="mt-3 space-y-2.5">
        {punkte.map((p, i) => (
          <li key={i} className="flex gap-2.5 text-[13.5px] leading-snug" style={{ color: RITTLER.black }}>
            <Check className="w-4 h-4 mt-0.5 shrink-0" style={{ color: STATUS_COLORS.done }} />
            <span>
              {p.text}
              {p.von && <span className="block"><WunschVon von={p.von} /></span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
