import React from 'react';
import { Clock, AlertTriangle, AlertCircle, Lock, Check } from 'lucide-react';
import { STATUS_COLORS, RITTLER, fmtDate, todayIso } from '@/components/sprint/sprintConfig';

const dayDiff = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);

// Stufenlogik der Signaturkomponente — Farbe UND Icon UND Wort, nie Pink.
export function countdownStage({ handoverDate, deadline, state, approvedAt }, today = todayIso()) {
  if (state === 'freigegeben') {
    return { key: 'freigegeben', color: STATUS_COLORS.done, text: STATUS_COLORS.doneText, Icon: Check, lock: true, pct: 100, wording: `Freigegeben am ${fmtDate(approvedAt || deadline)}` };
  }
  if (!deadline) {
    return { key: 'offen', color: STATUS_COLORS.neutral, text: STATUS_COLORS.neutral, Icon: Clock, pct: 0, wording: 'Feedbackfenster noch nicht gestartet' };
  }
  const total = handoverDate ? Math.max(dayDiff(deadline, handoverDate), 1) : null;
  const rest = dayDiff(deadline, today);
  const pct = total ? Math.min(Math.max(((total - rest) / total) * 100, 0), 100) : rest <= 0 ? 100 : 0;

  if (rest < 0) {
    return { key: 'eingefroren', color: STATUS_COLORS.frozen, text: STATUS_COLORS.frozen, Icon: Lock, lock: true, pct: 100, wording: `Eingefroren am ${fmtDate(deadline)}` };
  }
  if (rest === 0) {
    return { key: 'letzter_tag', color: STATUS_COLORS.critical, text: STATUS_COLORS.critical, Icon: AlertCircle, pct: 100, wording: 'Heute letzter Tag', bold: true };
  }
  if (pct > 80) {
    return { key: 'kritisch', color: STATUS_COLORS.critical, text: STATUS_COLORS.critical, Icon: AlertCircle, pct, wording: `noch ${rest} Tage · Frist läuft ab` };
  }
  if (pct >= 50) {
    return { key: 'vorwarnung', color: STATUS_COLORS.attention, text: STATUS_COLORS.attention, Icon: AlertTriangle, pct, wording: `noch ${rest} Tage · Vorwarnung gesendet` };
  }
  return { key: 'im_plan', color: STATUS_COLORS.neutral, text: STATUS_COLORS.neutral, Icon: Clock, pct, wording: `noch ${rest} Tage` };
}

// K1 — Countdown-Leiste: Spur, Füllung, Endmarke FREEZE. Die Zahl dominiert, nicht der Balken.
export default function CountdownLeiste({ handoverDate, deadline, state, approvedAt, className = '' }) {
  const stage = countdownStage({ handoverDate, deadline, state, approvedAt });
  const { Icon } = stage;

  return (
    <div className={className}>
      <div className="flex items-center justify-between text-[11px] mb-1" style={{ color: RITTLER.textSecondary }}>
        <span>{handoverDate ? `Übergabe ${fmtDate(handoverDate)}` : 'Übergabe offen'}</span>
        <span className="font-semibold uppercase tracking-wide" style={{ color: RITTLER.black }}>
          {deadline ? `Freeze ${fmtDate(deadline)}` : 'Freeze offen'}
        </span>
      </div>
      <div className="relative h-2 rounded-sm" style={{ backgroundColor: RITTLER.line }}>
        <div className="h-2 rounded-sm" style={{ width: `${stage.pct}%`, backgroundColor: stage.color }} />
        <div className="absolute top-[-3px] right-0 w-[2px] h-[14px]" style={{ backgroundColor: RITTLER.black }} />
      </div>
      <p
        className={`flex items-center gap-1.5 mt-1.5 text-base ${stage.bold ? 'font-extrabold' : 'font-bold'}`}
        style={{ color: stage.text }}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {stage.wording}
        {stage.lock && stage.key === 'freigegeben' && <Lock className="w-3.5 h-3.5" />}
      </p>
    </div>
  );
}