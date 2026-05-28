import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, AlertTriangle, Pencil } from 'lucide-react';

/**
 * Task 5: awork progress validation widget.
 * Allows PM to confirm or override awork progress with a reason.
 */
export default function RealProgressValidator({
  aworkProgressPct = 0,
  realProgressChecked = false,
  realProgressPct = 0,
  progressDifferenceReason = '',
  onSave,
  isSaving = false,
}) {
  const [editing, setEditing] = useState(false);
  const [localPct, setLocalPct] = useState(realProgressPct || aworkProgressPct);
  const [localReason, setLocalReason] = useState(progressDifferenceReason || '');

  const effectivePct = realProgressChecked && realProgressPct > 0 ? realProgressPct : aworkProgressPct;
  const hasDiff = realProgressChecked && Math.abs(realProgressPct - aworkProgressPct) > 2;

  const handleConfirm = () => {
    onSave({ real_progress_checked: true, real_progress_percent: aworkProgressPct, progress_difference_reason: '' });
  };

  const handleSaveOverride = () => {
    onSave({ real_progress_checked: true, real_progress_percent: localPct, progress_difference_reason: localReason });
    setEditing(false);
  };

  const handleReset = () => {
    onSave({ real_progress_checked: false, real_progress_percent: 0, progress_difference_reason: '' });
    setEditing(false);
    setLocalPct(aworkProgressPct);
    setLocalReason('');
  };

  return (
    <div className="space-y-2 p-3 bg-muted/30 rounded-xl border">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground">awork-Fortschritt:</span>
          <span className="text-xs font-bold text-blue-700">{Math.round(aworkProgressPct)}%</span>
          {hasDiff && (
            <>
              <span className="text-xs text-muted-foreground">→ korrigiert:</span>
              <span className="text-xs font-bold text-amber-700">{Math.round(realProgressPct)}%</span>
            </>
          )}
          {realProgressChecked && !hasDiff && (
            <span className="flex items-center gap-0.5 text-xs text-emerald-600">
              <CheckCircle2 className="w-3 h-3" /> bestätigt
            </span>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {!realProgressChecked && (
            <>
              <Button size="sm" variant="outline" className="h-6 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                disabled={isSaving} onClick={handleConfirm}>
                ✓ Ja, stimmt
              </Button>
              <Button size="sm" variant="outline" className="h-6 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                disabled={isSaving} onClick={() => setEditing(true)}>
                ✎ Korrigieren
              </Button>
            </>
          )}
          {realProgressChecked && (
            <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
              onClick={() => { setEditing(true); setLocalPct(realProgressPct || aworkProgressPct); setLocalReason(progressDifferenceReason || ''); }}>
              <Pencil className="w-3 h-3 mr-0.5" /> Ändern
            </Button>
          )}
        </div>
      </div>

      {!realProgressChecked && !editing && (
        <p className="text-xs text-amber-700 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" />
          awork-Fortschritt noch nicht validiert
        </p>
      )}

      {hasDiff && progressDifferenceReason && !editing && (
        <p className="text-xs text-muted-foreground italic">Grund: {progressDifferenceReason}</p>
      )}

      {editing && (
        <div className="space-y-2 pt-1 border-t">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground whitespace-nowrap">Tatsächlicher Fortschritt %</label>
            <Input type="number" min="0" max="100" value={localPct}
              onChange={e => setLocalPct(Number(e.target.value))}
              className="h-7 text-xs w-20" />
            <span className="text-xs text-muted-foreground">(awork: {Math.round(aworkProgressPct)}%)</span>
          </div>
          <Textarea
            value={localReason}
            onChange={e => setLocalReason(e.target.value)}
            placeholder="Warum weicht der tatsächliche Fortschritt vom awork-Stand ab?"
            className="text-xs resize-none h-14"
          />
          <div className="flex gap-2">
            <Button size="sm" className="h-6 text-xs" disabled={isSaving} onClick={handleSaveOverride}>
              Speichern
            </Button>
            <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditing(false)}>
              Abbrechen
            </Button>
            {realProgressChecked && (
              <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground ml-auto" onClick={handleReset}>
                Zurücksetzen
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}