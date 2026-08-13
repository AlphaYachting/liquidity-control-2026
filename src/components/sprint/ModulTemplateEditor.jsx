import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import { ROLES } from '@/components/sprint/sprintConfig';

// Pflichtkette eines Moduls: TicketTemplates sortiert nach order, mit Auf-/Ab-Verschieben
export default function ModulTemplateEditor({ module }) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [newRole, setNewRole] = useState('Konzept');
  const [newHours, setNewHours] = useState('');
  const [newPhase, setNewPhase] = useState('produktion');
  const PHASES = [
    { value: 'input', label: 'Input' },
    { value: 'produktion', label: 'Produktion' },
    { value: 'pruefung', label: 'Interne Prüfung' },
    { value: 'kundenfeedback', label: 'Kundenfeedback' },
  ];

  const { data: templates = [] } = useQuery({
    queryKey: ['ticketTemplates', module.id],
    queryFn: () => base44.entities.TicketTemplate.filter({ module_template_id: module.id }, 'order', 200),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['ticketTemplates', module.id] });

  const handleAdd = async () => {
    if (!newTitle) return;
    await base44.entities.TicketTemplate.create({
      module_template_id: module.id,
      order: templates.length + 1,
      title: newTitle,
      role: newRole,
      target_hours: Number(newHours) || 0,
      milestone_state: newPhase,
      blocks_others: false,
    });
    setNewTitle(''); setNewHours('');
    refresh();
  };

  const handleMove = async (idx, dir) => {
    const other = idx + dir;
    if (other < 0 || other >= templates.length) return;
    await base44.entities.TicketTemplate.bulkUpdate([
      { id: templates[idx].id, order: other + 1 },
      { id: templates[other].id, order: idx + 1 },
    ]);
    refresh();
  };

  const handleDelete = async (t) => {
    await base44.entities.TicketTemplate.delete(t.id);
    refresh();
  };

  return (
    <div className="bg-white rounded-lg shadow-sm p-5">
      <SectionLabel className="mb-1">Pflichtkette</SectionLabel>
      <h3 className="font-bold text-foreground uppercase mb-4">{module.name}</h3>

      <div className="space-y-2">
        {templates.map((t, idx) => (
          <div key={t.id} className="flex items-center gap-2 bg-muted rounded px-3 py-2">
            <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
            <span className="flex-1 text-sm text-foreground font-medium">{t.title}</span>
            <span className="text-xs text-muted-foreground">{t.role}</span>
            <span className="text-[11px] text-muted-foreground uppercase">{PHASES.find((p) => p.value === t.milestone_state)?.label || '—'}</span>
            {t.target_hours > 0 && <span className="text-xs text-muted-foreground">{t.target_hours} h</span>}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMove(idx, -1)} disabled={idx === 0}>
              <ArrowUp className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleMove(idx, 1)} disabled={idx === templates.length - 1}>
              <ArrowDown className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleDelete(t)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        ))}
        {templates.length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Ticketvorlagen — unten die erste anlegen.</p>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mt-4">
        <Input placeholder="Ticket-Titel" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="flex-1" />
        <Select value={newRole} onValueChange={setNewRole}>
          <SelectTrigger className="sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={newPhase} onValueChange={setNewPhase}>
          <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{PHASES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
        </Select>
        <Input type="number" placeholder="Soll-h" className="sm:w-24" value={newHours} onChange={(e) => setNewHours(e.target.value)} />
        <Button className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded" disabled={!newTitle} onClick={handleAdd}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}