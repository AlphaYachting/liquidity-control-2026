import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Plus, Save, X, Pencil } from 'lucide-react';
import { formatCurrency } from '@/lib/liquidityUtils';

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-teal-100 text-teal-700',
};

const emptyForm = (project) => ({
  project_id: project.id,
  customer: project.customer || '',
  project_name: project.project_name || '',
  order_number: project.order_number || '',
  confirmation_date: '',
  signed_date: '',
  total_net_amount: project.total_net_amount || '',
  vat_rate: 20,
  payment_terms: '',
  description: '',
  status: 'confirmed',
  document_url: '',
  notes: '',
});

export default function ConfirmedOrderPanel({ projectId, order, project }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(order || emptyForm(project));

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: (data) => order
      ? base44.entities.ConfirmedOrder.update(order.id, data)
      : base44.entities.ConfirmedOrder.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['confirmedOrders'] });
      setEditing(false);
    }
  });

  if (!order && !editing) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Auftragsbestätigung</CardTitle></CardHeader>
        <CardContent>
          <div className="text-center py-4 text-sm text-muted-foreground">
            <p>Keine AB verknüpft.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => { setForm(emptyForm(project)); setEditing(true); }}>
              <Plus className="w-3.5 h-3.5 mr-1" /> AB erfassen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (editing) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> AB {order ? 'bearbeiten' : 'erfassen'}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Auftragsnummer</Label>
                <Input value={form.order_number || ''} onChange={e => update('order_number', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => update('status', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['draft','sent','confirmed','cancelled','completed'].map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Bestätigungsdatum</Label>
                <Input type="date" value={form.confirmation_date || ''} onChange={e => update('confirmation_date', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Unterschrift-Datum</Label>
                <Input type="date" value={form.signed_date || ''} onChange={e => update('signed_date', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Betrag netto (€)</Label>
                <Input type="number" value={form.total_net_amount || ''} onChange={e => update('total_net_amount', e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">MwSt. (%)</Label>
                <Input type="number" value={form.vat_rate || 20} onChange={e => update('vat_rate', e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Zahlungsbedingungen</Label>
              <Input value={form.payment_terms || ''} onChange={e => update('payment_terms', e.target.value)} placeholder="z.B. 50% Anzahlung, Rest bei Abnahme" />
            </div>
            <div>
              <Label className="text-xs">Dokument-URL</Label>
              <Input value={form.document_url || ''} onChange={e => update('document_url', e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label className="text-xs">Notizen</Label>
              <Textarea value={form.notes || ''} onChange={e => update('notes', e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => saveMutation.mutate({ ...form, total_net_amount: Number(form.total_net_amount) || 0 })} disabled={saveMutation.isPending}>
                <Save className="w-3.5 h-3.5 mr-1" /> Speichern
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setEditing(false); setForm(order || emptyForm(project)); }}>
                <X className="w-3.5 h-3.5 mr-1" /> Abbrechen
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4" /> Auftragsbestätigung</CardTitle>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setForm(order); setEditing(true); }}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Auftragsnr.</span>
          <span className="font-medium">{order.order_number || '—'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Status</span>
          <Badge className={STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-600'}>{order.status}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Betrag netto</span>
          <span className="font-semibold">{formatCurrency(order.total_net_amount)}</span>
        </div>
        {order.confirmation_date && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Bestätigt am</span>
            <span>{order.confirmation_date}</span>
          </div>
        )}
        {order.payment_terms && (
          <div className="pt-1 border-t">
            <p className="text-xs text-muted-foreground">{order.payment_terms}</p>
          </div>
        )}
        {order.document_url && (
          <a href={order.document_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-primary hover:underline pt-1">
            <FileText className="w-3 h-3" /> Dokument öffnen
          </a>
        )}
      </CardContent>
    </Card>
  );
}