import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, AlertTriangle } from 'lucide-react';
import { fmtEUR, fmtDate } from '@/lib/restructuring/restructuringFormat';
import CashflowPlanGroup from '@/components/restructuring/plan/CashflowPlanGroup';
import CashflowPlanItemDialog from '@/components/restructuring/plan/CashflowPlanItemDialog';

export default function RestructuringPlan() {
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [patterns, setPatterns] = useState([]);
  const [vatRate, setVatRate] = useState(20);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [plans, pats, settings] = await Promise.all([
      base44.entities.CashflowPlan.filter({ status: 'active' }),
      base44.entities.PaymentPattern.list(),
      base44.entities.RestructuringSetting.list(),
    ]);
    const active = plans[0] || null;
    setPlan(active);
    setPatterns(pats);
    setVatRate(settings[0]?.default_vat_rate ?? 20);
    setItems(active ? await base44.entities.CashflowPlanItem.filter({ plan_id: active.id }) : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createPlan = async () => {
    await base44.entities.CashflowPlan.create({
      name: `Geldflussrechnung 13 Wochen, Stand ${fmtDate(new Date())}`,
      status: 'active',
      weeks: 13,
    });
    load();
  };

  const removeItem = async (id) => {
    await base44.entities.CashflowPlanItem.delete(id);
    load();
  };

  const patternName = (id) => patterns.find((p) => p.id === id)?.name || null;

  if (loading) return <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-96" /></div>;

  if (!plan) {
    return (
      <Card className="p-6 text-center">
        <AlertTriangle className="w-5 h-5 mx-auto text-amber-600" />
        <p className="text-sm font-semibold mt-2">Kein aktiver Plan vorhanden</p>
        <p className="text-xs text-muted-foreground mt-1">Es darf immer nur ein Plan aktiv sein. Bitte einen Plan anlegen.</p>
        <Button size="sm" className="mt-3" onClick={createPlan}><Plus className="w-3.5 h-3.5 mr-1" /> Plan anlegen</Button>
      </Card>
    );
  }

  const sections = [
    { direction: 'inflow', title: 'Einzahlungen' },
    { direction: 'outflow', title: 'Auszahlungen' },
  ];

  const total = (list, f) => list.reduce((s, i) => s + (Number(i[f]) || 0), 0);

  return (
    <div className="space-y-4">
      <Card className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-sm font-bold">{plan.name}</h1>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Planbeginn {plan.plan_start_date ? fmtDate(plan.plan_start_date) : '—'} · Stichtag {plan.cutoff_date ? fmtDate(plan.cutoff_date) : '—'} · {plan.weeks || 13} Wochen
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Neue Position
        </Button>
      </Card>

      {sections.map((sec) => {
        const list = items.filter((i) => i.direction === sec.direction);
        const cats = [...new Set(list.map((i) => i.category))];
        return (
          <Card key={sec.direction} className="p-4">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-sm font-bold">{sec.title}</h2>
              <p className="text-xs tabular-nums">
                {fmtEUR(total(list, 'amount_gross'))}
                <span className="text-muted-foreground"> · ALT {fmtEUR(total(list, 'amount_alt_gross'))} · NEU {fmtEUR(total(list, 'amount_neu_gross'))}</span>
              </p>
            </div>
            {list.length === 0 && <p className="text-xs text-muted-foreground py-3">Noch keine Positionen erfasst.</p>}
            <div className="overflow-x-auto">
              {cats.map((c) => (
                <CashflowPlanGroup
                  key={c}
                  category={c}
                  items={list.filter((i) => i.category === c)}
                  patternName={patternName}
                  onEdit={(i) => { setEditing(i); setDialogOpen(true); }}
                  onDelete={removeItem}
                />
              ))}
            </div>
          </Card>
        );
      })}

      <CashflowPlanItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        planId={plan.id}
        item={editing}
        patterns={patterns}
        defaultVatRate={vatRate}
        onSaved={load}
      />
    </div>
  );
}