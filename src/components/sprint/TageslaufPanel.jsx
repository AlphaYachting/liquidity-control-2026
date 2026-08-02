import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Play, AlertTriangle, Check } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import TageslaufProtokoll from '@/components/sprint/TageslaufProtokoll';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';

// Der Tageslauf läuft werktags um 07:00. Dieser Knopf startet ihn zum Testen sofort.
export default function TageslaufPanel() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  const { data: runs = [] } = useQuery({
    queryKey: ['sprintDailyRuns'],
    queryFn: () => base44.entities.SprintDailyRun.list('-started_at', 10),
  });

  const starten = async () => {
    setBusy(true);
    setFehler('');
    const res = await base44.functions.invoke('sprintTageslauf', { manual: true }).catch((e) => ({ data: { error: e.message } }));
    setBusy(false);
    if (res?.data?.error) setFehler(res.data.error);
    qc.invalidateQueries({ queryKey: ['sprintDailyRuns'] });
  };

  const letzter = runs[0];

  return (
    <div className="bg-white rounded-lg border border-[#e0e0e0] p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <SectionLabel>Sprint-Tageslauf</SectionLabel>
          <p className="text-[13px] mt-1" style={{ color: RITTLER.textSecondary }}>
            Läuft werktags um 07:00: Sprint-Status, Vorwarnung, Fristmeldung, stillschweigende Freigabe,
            auslaufende Sprints, Warnsignale. Mehrfachläufe am selben Tag erzeugen keine Doppelten.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={starten}
          className="rounded border-[1.5px] border-[#2d2d2d] text-[#2d2d2d] shrink-0"
        >
          <Play className="w-4 h-4" /> {busy ? 'Läuft …' : 'Tageslauf jetzt ausführen'}
        </Button>
      </div>

      {fehler && (
        <p className="flex items-center gap-2 text-sm" style={{ color: STATUS_COLORS.critical }}>
          <AlertTriangle className="w-4 h-4" /> {fehler}
        </p>
      )}

      {letzter && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            {letzter.status === 'mit_fehlern' ? (
              <AlertTriangle className="w-4 h-4" style={{ color: STATUS_COLORS.attention }} />
            ) : (
              <Check className="w-4 h-4" style={{ color: STATUS_COLORS.doneText }} />
            )}
            <p className="text-sm font-bold" style={{ color: RITTLER.black }}>Letzter Lauf</p>
          </div>
          <TageslaufProtokoll run={letzter} />
        </div>
      )}

      {runs.length > 1 && (
        <div className="pt-3 border-t" style={{ borderColor: RITTLER.line }}>
          <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: RITTLER.black }}>
            Frühere Läufe
          </p>
          <div className="space-y-1">
            {runs.slice(1).map((r) => (
              <div key={r.id} className="flex items-center gap-3 text-[13px]">
                <span style={{ color: RITTLER.textSecondary }}>
                  {new Date(r.started_at).toLocaleString('de-AT', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span style={{ color: RITTLER.black }}>
                  {(r.steps || []).reduce((s, x) => s + (x.processed || 0), 0)} Objekte
                </span>
                <span style={{ color: r.status === 'mit_fehlern' ? STATUS_COLORS.attention : RITTLER.textSecondary }}>
                  {r.status === 'mit_fehlern' ? `${(r.errors || []).length} Fehler` : 'ohne Fehler'}
                </span>
                <span style={{ color: RITTLER.textSecondary }}>{r.trigger}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {runs.length === 0 && (
        <p className="text-sm" style={{ color: RITTLER.textSecondary }}>Noch kein Lauf protokolliert.</p>
      )}
    </div>
  );
}