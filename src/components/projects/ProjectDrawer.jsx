import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/shared/StatusBadge';
import { formatCurrency } from '@/lib/liquidityUtils';
import { Save } from 'lucide-react';

export default function ProjectDrawer({ project, onClose, onSave }) {
  const [form, setForm] = useState({ ...project });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Sheet open={!!project} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-lg">{project.project_name}</SheetTitle>
          <p className="text-sm text-muted-foreground">{project.customer}</p>
        </SheetHeader>

        <div className="space-y-5 mt-6">
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-xl">
            <div><p className="text-xs text-muted-foreground">Gesamt netto</p><p className="font-semibold">{formatCurrency(project.total_net_amount)}</p></div>
            <div><p className="text-xs text-muted-foreground">Verrechnet</p><p className="font-semibold">{formatCurrency(project.already_invoiced_amount)}</p></div>
            <div><p className="text-xs text-muted-foreground">Offen</p><p className="font-semibold text-amber-600">{formatCurrency(project.open_amount)}</p></div>
            <div><p className="text-xs text-muted-foreground">Externe Kosten</p><p className="font-semibold">{formatCurrency(project.external_costs)}</p></div>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => update('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['active', 'completed', 'on_hold', 'cancelled', 'unclear'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Risiko</Label>
              <Select value={form.risk_status || 'none'} onValueChange={v => update('risk_status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['none', 'low', 'medium', 'high', 'critical'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Erwarteter Rechnungsmonat</Label>
              <Input value={form.expected_invoice_month || ''} onChange={e => update('expected_invoice_month', e.target.value)} placeholder="z.B. 2026-03" />
            </div>
            <div>
              <Label className="text-xs">Priorität</Label>
              <Select value={form.priority || 'medium'} onValueChange={v => update('priority', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['high', 'medium', 'low'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Notizen</Label>
              <Textarea value={form.notes || ''} onChange={e => update('notes', e.target.value)} rows={3} />
            </div>
          </div>

          <Button className="w-full" onClick={() => onSave(form)}>
            <Save className="w-4 h-4 mr-2" /> Speichern
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}