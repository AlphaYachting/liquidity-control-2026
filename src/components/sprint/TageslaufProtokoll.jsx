import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// Protokoll eines Laufs: je Schritt die Anzahl verarbeiteter Objekte, Fehler im Klartext.
export default function TageslaufProtokoll({ run }) {
  const steps = run.steps || [];
  const errors = run.errors || [];

  return (
    <div>
      <p className="text-[13px] mb-2" style={{ color: RITTLER.textSecondary }}>
        {new Date(run.started_at).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' })} ·{' '}
        {((run.duration_ms || 0) / 1000).toFixed(1)} s · {run.trigger}
        {run.triggered_by ? ` · ${run.triggered_by}` : ''}
      </p>

      <div className="rounded border" style={{ borderColor: RITTLER.line }}>
        {steps.map((s) => (
          <div
            key={s.key}
            className="flex items-center gap-3 px-3 py-2 border-b last:border-0"
            style={{ borderColor: '#eeeeee' }}
          >
            <span className="text-xs font-bold w-7 shrink-0" style={{ color: RITTLER.textSecondary }}>{s.key}</span>
            <span className="text-[13px] flex-1" style={{ color: RITTLER.black }}>{s.label}</span>
            {s.detail && (
              <span className="text-xs truncate max-w-[45%]" style={{ color: s.failed ? STATUS_COLORS.critical : RITTLER.textSecondary }}>
                {s.detail}
              </span>
            )}
            <span
              className="text-sm font-bold w-8 text-right shrink-0"
              style={{ color: s.processed > 0 ? RITTLER.black : RITTLER.textSecondary }}
            >
              {s.processed || 0}
            </span>
          </div>
        ))}
      </div>

      {errors.length > 0 && (
        <div className="mt-3 rounded p-3" style={{ backgroundColor: STATUS_COLORS.attentionSurface }}>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide mb-1" style={{ color: STATUS_COLORS.attention }}>
            <AlertTriangle className="w-3.5 h-3.5" /> Fehler
          </p>
          {errors.map((e, i) => (
            <p key={i} className="text-[13px]" style={{ color: STATUS_COLORS.attention }}>{e}</p>
          ))}
        </div>
      )}
    </div>
  );
}