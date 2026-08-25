import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUp, ArrowDown, Trash2, Pencil, Check, X } from 'lucide-react';
import { ROLES } from '@/components/sprint/sprintConfig';

// Eine Ticketvorlage der Pflichtkette — anzeigen und einzeln bearbeiten
export default function TicketTemplateZeile({ template, index, letzte, phasen, onMove, onDelete, onChanged }) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    title: template.title || '',
    role: template.role || 'Konzept',
    milestone_state: template.milestone_state || 'produktion',
    target_hours: template.target_hours || '',
  });
  const [saving, setSaving] = useState(false);

  const speichern = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    await base44.entities.TicketTemplate.update(template.id, {
      title: form.title.trim(),
      role: form.role,
      milestone_state: form.milestone_state,
      target_hours: Number(form.target_hours) || 0,
    });
    setSaving(false);
    setEdit(false);
    onChanged();
  };

  if (edit) {
    return (
      <div className="rounded border border-primary/40 bg-muted/50 px-3 py-2.5 space-y-2">
        <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ticket-Titel" />
        <div className="flex flex-wrap gap-2">
          <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={form.milestone_state} onValueChange={(v) => setForm({ ...form, milestone_state: v })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{phasen.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" className="w-24" placeholder="Soll-h" value={form.target_hours}
            onChange={(e) => setForm({ ...form, target_hours: e.target.value })} />
          <Button size="sm" className="font-bold uppercase" disabled={saving || !form.title.trim()} onClick={speichern}>
            <Check className="w-4 h-4 mr-1" /> Speichern
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEdit(false)}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-center gap-2 rounded border bg-card px-3 py-2 hover:border-primary/40 transition-colors">
      <span className="text-xs text-muted-foreground w-5 shrink-0">{index + 1}.</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{template.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {template.role} · {phasen.find((p) => p.value === template.milestone_state)?.label || '—'}
          {template.target_hours > 0 ? ` · ${template.target_hours} h` : ''}
        </p>
      </div>
      <div className="flex items-center opacity-60 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-7 w-7" title="Bearbeiten" onClick={() => setEdit(true)}>
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove(index, -1)} disabled={index === 0}>
          <ArrowUp className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMove(index, 1)} disabled={letzte}>
          <ArrowDown className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => onDelete(template)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}