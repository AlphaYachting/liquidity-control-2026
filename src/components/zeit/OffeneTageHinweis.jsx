import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { dauerText } from '@/lib/zeit/tagesAuswertung';

const fmt = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

// Sagt im Klartext, welcher Tag noch offen ist und was das bedeutet.
export default function OffeneTageHinweis({ offeneTage, aeltester, gewaehlt, onWaehlen }) {
  if (!aeltester) return null;
  const weitere = offeneTage.length - 1;

  return (
    <div
      className="rounded p-4"
      style={{ backgroundColor: STATUS_COLORS.attentionSurface, border: `1.5px solid ${STATUS_COLORS.attention}` }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: STATUS_COLORS.attention }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: STATUS_COLORS.attention }}>
            {fmt(aeltester.tag)} ist noch nicht abgeschlossen — {aeltester.offenMinuten > 0
              ? `${dauerText(aeltester.offenMinuten)} offen`
              : 'nichts erfasst'}
            {weitere > 0 ? ` (und ${weitere} weitere${weitere === 1 ? 'r' : ''} Tag${weitere === 1 ? '' : 'e'})` : ''}
          </p>
          <p className="text-sm mt-0.5" style={{ color: RITTLER.black }}>
            Bis zum Abschluss dieses Tages wird keine neue Zeit gebucht. Der Timer darf weiterlaufen — gemessene Zeit
            geht nicht verloren.
          </p>
          {gewaehlt !== aeltester.tag && (
            <button
              type="button"
              onClick={() => onWaehlen(aeltester.tag)}
              className="mt-2 text-xs font-bold uppercase underline"
              style={{ color: STATUS_COLORS.attention }}
            >
              Zum offenen Tag
            </button>
          )}
        </div>
      </div>
    </div>
  );
}