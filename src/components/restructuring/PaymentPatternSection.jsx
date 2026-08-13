import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Pencil, AlertTriangle } from 'lucide-react';
import { fmtEUR } from '@/lib/restructuring/restructuringFormat';
import { validatePattern, patternPreview } from '@/lib/restructuring/paymentPattern';
import PaymentPatternForm from './PaymentPatternForm';

export default function PaymentPatternSection() {
  const [patterns, setPatterns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const list = await base44.entities.PaymentPattern.list();
    setPatterns(list);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id) => {
    await base44.entities.PaymentPattern.delete(id);
    load();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-bold">Zahlungsstaffeln</h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Verteilung eines Rechnungsbetrags auf Wochen ab der Rechnungswoche — bildet das reale Zahlungsverhalten ab.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => { setShowNew(true); setEditingId(null); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Neue Staffel
        </Button>
      </div>

      {showNew && (
        <div className="mb-3">
          <PaymentPatternForm
            onCancel={() => setShowNew(false)}
            onSaved={() => { setShowNew(false); load(); }}
          />
        </div>
      )}

      {loading && <p className="text-xs text-muted-foreground py-3">Lädt…</p>}
      {!loading && patterns.length === 0 && !showNew && (
        <p className="text-xs text-muted-foreground py-3">Noch keine Staffel angelegt.</p>
      )}

      <div className="space-y-2">
        {patterns.map((p) =>
          editingId === p.id ? (
            <PaymentPatternForm
              key={p.id}
              pattern={p}
              onCancel={() => setEditingId(null)}
              onSaved={() => { setEditingId(null); load(); }}
            />
          ) : (
            <PatternRow key={p.id} pattern={p} onEdit={() => setEditingId(p.id)} onDelete={() => remove(p.id)} />
          )
        )}
      </div>
    </Card>
  );
}

function PatternRow({ pattern, onEdit, onDelete }) {
  const error = validatePattern(pattern.offsets_weeks || [], pattern.shares_percent || []);
  const preview = patternPreview(pattern, 10000, 4);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">
            {pattern.name}
            {pattern.is_default && (
              <span className="ml-1.5 text-[10px] font-bold text-emerald-700">Standard</span>
            )}
          </p>
          {pattern.description && <p className="text-[11px] text-muted-foreground mt-0.5">{pattern.description}</p>}
          <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            Wochenversatz [{(pattern.offsets_weeks || []).join(', ')}] · Anteile [{(pattern.shares_percent || []).join(', ')}] %
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={onDelete}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      </div>

      {error ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] text-red-700">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" /> {error}
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground tabular-nums">
          Vorschau bei {fmtEUR(10000)} Rechnungsbetrag, Rechnungswoche W4:{' '}
          {preview.map((s, i) => (
            <span key={i} className="text-foreground">
              W{s.week}: {fmtEUR(s.amount)}{i < preview.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}