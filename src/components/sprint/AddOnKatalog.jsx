import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import SectionLabel from '@/components/sprint/SectionLabel';
import { fmtEUR, ROLES } from '@/components/sprint/sprintConfig';

const EMPTY = { name: '', description: '', target_hours: '', price: '', tickets: '' };
const PHASES = ['input', 'produktion', 'pruefung', 'kundenfeedback'];

// Eine Ticketzeile: "Titel | Rolle | Stunden | Phase" — Rolle und Aufwand sind Pflichtangaben des Katalogs
function parseTicketLine(line, order, blockId) {
  const [title, role, hours, phase] = line.split('|').map((s) => (s || '').trim());
  return {
    add_on_block_id: blockId,
    order,
    title,
    role: ROLES.includes(role) ? role : 'Beratung',
    target_hours: Number(hours) || 0,
    milestone_state: PHASES.includes(phase) ? phase : 'produktion',
    blocks_others: false,
  };
}

// Katalog der Zusatzbausteine — Anlegen nur für Prozessverantwortliche, approved_by kommt aus der Anmeldung
export default function AddOnKatalog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const { data } = useQuery({
    queryKey: ['addOnBlocks'],
    queryFn: async () => {
      const [blocks, ticketTemplates, me] = await Promise.all([
        base44.entities.AddOnBlock.list('-created_date', 200),
        base44.entities.AddOnTicketTemplate.list('order', 500),
        base44.auth.me(),
      ]);
      const member = (await base44.entities.TeamMember.filter({ email: me.email }, 'name', 1))[0] || null;
      return { blocks, ticketTemplates, me, member };
    },
  });

  const blocks = data?.blocks || [];
  const ticketTemplates = data?.ticketTemplates || [];
  const member = data?.member;
  const isProcessOwner = !!member?.process_owner;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name && form.target_hours && form.price;

  const handleSave = async () => {
    if (!valid || !isProcessOwner) return;
    setSaving(true);
    const block = await base44.entities.AddOnBlock.create({
      name: form.name,
      description: form.description,
      target_hours: Number(form.target_hours),
      price: Number(form.price),
      approved_by: member.name,
      active: true,
    });
    const lines = form.tickets.split('\n').map((s) => s.trim()).filter(Boolean);
    if (lines.length) {
      await base44.entities.AddOnTicketTemplate.bulkCreate(
        lines.map((line, i) => parseTicketLine(line, i + 1, block.id)),
      );
    }
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
        {isProcessOwner && (
          <Button className="bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded" onClick={() => setOpen(true)}>
            Baustein anlegen
          </Button>
        )}
      </div>

      {!isProcessOwner && (
        <p className="text-xs text-[#6b6b6b] mb-3">
          Bausteine nimmt der Prozessverantwortliche in den Katalog auf.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        {blocks.filter((b) => b.active !== false).map((b) => {
          const tickets = ticketTemplates.filter((t) => t.add_on_block_id === b.id);
          return (
            <div key={b.id} className="bg-[#f5f5f5] rounded p-3">
              <p className="font-semibold text-sm text-[#2d2d2d]">{b.name}</p>
              {b.description && <p className="text-xs text-[#6b6b6b] mt-0.5">{b.description}</p>}
              <p className="text-xs text-[#2d2d2d] mt-1.5">{b.target_hours} h · {fmtEUR(b.price)}</p>
              {tickets.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {tickets.map((t) => (
                    <li key={t.id} className="text-[11px] text-[#6b6b6b]">
                      {t.title} · {t.role} · {t.target_hours} h
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-[#6b6b6b] mt-1">Aufgenommen von {b.approved_by}</p>
            </div>
          );
        })}
        {blocks.length === 0 && <p className="text-sm text-[#6b6b6b]">Noch keine Zusatzbausteine im Katalog.</p>}
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
            <div>
              <Label>Aufgaben — eine Zeile je Aufgabe</Label>
              <Textarea
                rows={3} value={form.tickets} onChange={set('tickets')}
                placeholder={'Titel | Rolle | Stunden | Phase\nShooting durchführen | Media | 4 | produktion'}
              />
              <p className="text-[11px] text-[#6b6b6b] mt-1">
                Rollen: {ROLES.join(', ')} · Phasen: {PHASES.join(', ')}
              </p>
            </div>
            <p className="text-xs text-[#6b6b6b]">Aufgenommen von {member?.name || '—'}</p>
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