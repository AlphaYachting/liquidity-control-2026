import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SectionLabel from '@/components/sprint/SectionLabel';
import { fmtEUR } from '@/components/sprint/sprintConfig';

const EMPTY = { name: '', description: '', target_hours: '', price: '', ticket_titles: '', approved_by: '' };

// Katalog der Zusatzbausteine (AddOnBlock) — approved_by ist Pflicht
export default function AddOnKatalog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data: blocks = [] } = useQuery({
    queryKey: ['addOnBlocks'],
    queryFn: () => base44.entities.AddOnBlock.list('-created_date', 200),
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name && form.target_hours && form.price && form.approved_by;

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);
    await base44.entities.AddOnBlock.create({
      name: form.name,
      description: form.description,
      target_hours: Number(form.target_hours),
      price: Number(form.price),
      ticket_titles: form.ticket_titles.split('\n').map((s) => s.trim()).filter(Boolean),
      approved_by: form.approved_by,
      active: true,
    });
    setSaving(false);
    setForm(EMPTY);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ['addOnBlocks'] });
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <SectionLabel>Zusatzbausteine</SectionLabel>
          <h3 className="font-bold text-[#2d2d2d] uppercase">Add-on-Katalog</h3>
        </div>
        <Button className="bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded" onClick={() => setOpen(true)}>
          Baustein anlegen
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {blocks.filter((b) => b.active !== false).map((b) => (
          <div key={b.id} className="bg-[#f5f5f5] rounded p-3">
            <p className="font-semibold text-sm text-[#2d2d2d]">{b.name}</p>
            {b.description && <p className="text-xs text-[#999999] mt-0.5">{b.description}</p>}
            <p className="text-xs text-[#2d2d2d] mt-1.5">{b.target_hours} h · {fmtEUR(b.price)}</p>
            {(b.ticket_titles || []).length > 0 && (
              <p className="text-[11px] text-[#999999] mt-1">{b.ticket_titles.length} Ticket(s): {b.ticket_titles.join(', ')}</p>
            )}
            <p className="text-[11px] text-[#999999] mt-1">Aufgenommen von {b.approved_by}</p>
          </div>
        ))}
        {blocks.length === 0 && <p className="text-sm text-[#999999]">Noch keine Zusatzbausteine im Katalog.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="uppercase font-bold text-[#2d2d2d]">Zusatzbaustein anlegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={set('name')} placeholder="z. B. Fotoshooting" /></div>
            <div><Label>Beschreibung</Label><Textarea rows={2} value={form.description} onChange={set('description')} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Aufwand (h) *</Label><Input type="number" value={form.target_hours} onChange={set('target_hours')} /></div>
              <div><Label>Preis (EUR) *</Label><Input type="number" value={form.price} onChange={set('price')} /></div>
            </div>
            <div><Label>Tickets (eine Zeile je Ticket)</Label><Textarea rows={3} value={form.ticket_titles} onChange={set('ticket_titles')} /></div>
            <div><Label>Aufgenommen von *</Label><Input value={form.approved_by} onChange={set('approved_by')} /></div>
            <Button
              className="w-full bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
              disabled={saving || !valid} onClick={handleSave}
            >
              {saving ? 'Speichert…' : 'In Katalog aufnehmen'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}