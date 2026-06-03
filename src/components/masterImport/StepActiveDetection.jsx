import React, { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, MinusCircle, ChevronRight, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { detectActiveProject, formatCurrency } from '@/lib/masterImportUtils';

const OVERRIDE_LABELS = {
  auto: 'Auto',
  force_active: 'Aktiv (manuell)',
  force_inactive: 'Inaktiv (manuell)',
  ignore: 'Ignorieren',
};

export default function StepActiveDetection({ rows, onConfirm }) {
  const [overrides, setOverrides] = useState({});

  const detectedRows = useMemo(() => rows.map(row => {
    const result = detectActiveProject(row);
    return { ...row, detection: result };
  }), [rows]);

  const active = detectedRows.filter(r => {
    const ov = overrides[r.row_number];
    if (ov === 'force_active') return true;
    if (ov === 'force_inactive' || ov === 'ignore') return false;
    return r.detection.is_active;
  });

  const toggleOverride = (rowNum, current) => {
    const cycle = { auto: 'force_active', force_active: 'force_inactive', force_inactive: 'ignore', ignore: 'auto' };
    setOverrides(prev => ({ ...prev, [rowNum]: cycle[current || 'auto'] }));
  };

  function handleConfirm() {
    const finalRows = detectedRows.map(r => {
      const ov = overrides[r.row_number] || 'auto';
      let isActive;
      if (ov === 'force_active') isActive = true;
      else if (ov === 'force_inactive' || ov === 'ignore') isActive = false;
      else isActive = r.detection.is_active;
      return {
        ...r,
        is_active_project: isActive,
        active_detection_reason: r.detection.reason,
        confidence_score: r.detection.confidence,
        user_override_active: ov,
      };
    }).filter(r => (overrides[r.row_number] || 'auto') !== 'ignore');
    onConfirm(finalRows);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 3: Aktive Projekte erkennen</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Die App hat automatisch erkannt, welche Zeilen aktive/offene Projekte repräsentieren.
          Du kannst einzelne Einträge manuell überschreiben.
        </p>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-emerald-700">
          <CheckCircle2 className="w-4 h-4" />
          {active.length} aktiv erkannt
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <XCircle className="w-4 h-4" />
          {detectedRows.length - active.length} inaktiv / ignoriert
        </span>
      </div>

      <div className="border rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground gap-2">
          <span className="col-span-3">Kunde · Projekt</span>
          <span className="col-span-2">PM</span>
          <span className="col-span-2">Offen netto</span>
          <span className="col-span-2">Erkennungsgrund</span>
          <span className="col-span-1 text-center">Conf.</span>
          <span className="col-span-2 text-center">Status</span>
        </div>
        <div className="divide-y max-h-[500px] overflow-y-auto">
          {detectedRows.map(row => {
            const ov = overrides[row.row_number] || 'auto';
            const isActive = ov === 'force_active' ? true : ov === 'force_inactive' || ov === 'ignore' ? false : row.detection.is_active;
            const ignored = ov === 'ignore';
            return (
              <div key={row.row_number}
                className={`grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm ${ignored ? 'opacity-40' : ''}`}>
                <div className="col-span-3 min-w-0">
                  <p className="font-medium truncate">{row.customer_name_normalized || row.customer_name_raw || '—'}</p>
                  <p className="text-xs text-muted-foreground truncate">{row.project_name_raw || '—'}</p>
                </div>
                <span className="col-span-2 text-xs text-muted-foreground truncate">{row.project_manager || '—'}</span>
                <span className="col-span-2 text-sm font-medium">{formatCurrency(row.open_amount_net)}</span>
                <span className="col-span-2 text-xs text-muted-foreground line-clamp-2">{row.detection.reason}</span>
                <span className={`col-span-1 text-center text-xs font-bold ${row.detection.confidence >= 70 ? 'text-emerald-600' : row.detection.confidence >= 40 ? 'text-amber-600' : 'text-red-500'}`}>
                  {row.detection.confidence}%
                </span>
                <div className="col-span-2 flex justify-center">
                  <button
                    onClick={() => toggleOverride(row.row_number, ov)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border transition-colors ${
                      ov === 'auto' && isActive ? 'border-emerald-300 bg-emerald-50 text-emerald-700' :
                      ov === 'auto' && !isActive ? 'border-gray-300 bg-gray-50 text-gray-500' :
                      ov === 'force_active' ? 'border-emerald-500 bg-emerald-100 text-emerald-800 font-medium' :
                      ov === 'force_inactive' ? 'border-red-300 bg-red-50 text-red-600' :
                      'border-gray-200 bg-gray-100 text-gray-400'
                    }`}>
                    {isActive ? <CheckCircle2 className="w-3 h-3" /> : ignored ? <MinusCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {OVERRIDE_LABELS[ov]}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Button onClick={handleConfirm} className="gap-2">
        {active.length} aktive Projekte übernehmen
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}