import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PIPELINES, STAGE_LABELS, isClosedStage, isWonStage } from '@/components/crm/stages';

const tageSeit = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);

// Die Phasen als Weg — ersetzt das Auswahlfeld im Kopf.
export default function Phasenleiste({ deal, activities = [], onStageChange, onBeauftragen }) {
  const config = PIPELINES[deal.pipeline];
  if (!config || deal.stage === config.lostStage) return null;

  const stufen = [
    ...config.stages.map((s) => ({ key: s.key, label: s.label })),
    { key: config.wonStage, label: deal.pipeline === 'existing_customer' ? 'Beauftragt' : 'Gewonnen' },
  ];
  const won = isWonStage(deal.stage);
  const aktuellerIndex = won ? stufen.length - 1 : stufen.findIndex((s) => s.key === deal.stage);
  const gesperrt = isClosedStage(deal.stage);

  // Eintrittsdatum: der Verlaufseintrag der Phase; für die erste Stufe das Anlagedatum.
  const eintritt = (key, i) => {
    const treffer = activities
      .filter((a) => a.activity_type === 'stage_change' && a.title === `Phase: ${STAGE_LABELS[key]}`)
      .map((a) => a.activity_date || a.created_date)
      .sort((x, y) => new Date(y) - new Date(x))[0];
    if (treffer) return treffer;
    return i === 0 ? deal.created_date : null;
  };

  const unterzeile = (key, i) => {
    if (i === stufen.length - 1) return 'Übergabeblatt';
    const eigen = eintritt(key, i);
    if (i === aktuellerIndex) {
      if (!eigen) return '';
      const t = tageSeit(eigen);
      return t === 0 ? 'seit heute' : `seit ${t} Tagen`;
    }
    if (i < aktuellerIndex) {
      const naechste = eintritt(stufen[i + 1].key, i + 1);
      if (!eigen || !naechste) return 'erledigt';
      return `${Math.max(0, Math.floor((new Date(naechste) - new Date(eigen)) / 86400000))} Tage`;
    }
    return '';
  };

  const klick = (s, i) => {
    if (i === aktuellerIndex) return;
    if (i === stufen.length - 1) onBeauftragen?.();
    else onStageChange?.(s.key);
  };

  return (
    <div className="flex overflow-x-auto bg-card border rounded-lg" role="list">
      {stufen.map((s, i) => {
        const aktuell = i === aktuellerIndex;
        const erledigt = i < aktuellerIndex;
        const sub = unterzeile(s.key, i);
        return (
          <React.Fragment key={s.key}>
            {i > 0 && (
              <span className="self-center shrink-0">
                <ChevronRight className="w-4 h-4 text-border" />
              </span>
            )}
            <button
              type="button"
              role="listitem"
              aria-current={aktuell ? 'step' : undefined}
              title="Phase wechseln"
              disabled={gesperrt || aktuell}
              onClick={() => klick(s, i)}
              className={cn(
                'relative flex-1 min-w-[150px] text-left px-4 py-2',
                aktuell && 'bg-foreground text-background',
              )}
            >
              <span className="inline-flex items-center gap-1.5">
                {erledigt && <Check className="w-3.5 h-3.5 text-status-done shrink-0" />}
                <span className={cn(
                  'text-[13px]',
                  aktuell ? 'font-semibold' : erledigt ? 'font-semibold text-foreground/80' : 'font-medium text-muted-foreground',
                )}>
                  {s.label}
                </span>
              </span>
              {sub && (
                <span className={cn('block text-[12px]', aktuell ? 'text-background/80' : 'text-muted-foreground')}>
                  {sub}
                </span>
              )}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}