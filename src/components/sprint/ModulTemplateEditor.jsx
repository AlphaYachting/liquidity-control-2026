import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import { ROLES } from '@/components/sprint/sprintConfig';
import TicketTemplateZeile from '@/components/sprint/TicketTemplateZeile';
import ModulKopfFelder from '@/components/sprint/ModulKopfFelder';
import RoutineVorlageFelder, { routineFelderAusForm } from '@/components/sprint/RoutineVorlageFelder';

// Pflichtkette eines Moduls: TicketTemplates sortiert nach order, einzeln bearbeitbar
export default function ModulTemplateEditor({ module, onModuleChanged, onModuleDeleted }) {
  const qc = useQueryClient();
  const [newTitle, setNewTitle] = useState('');
  const [newRole, setNewRole] = useState('Konzept');
  const [newHours, setNewHours] = useState('');
  const [newPhase, setNewPhase] = useState('produktion');
  const istContainer = module.default_arbeitsmodell === 'container';
  const [neuRoutine, setNeuRoutine] = useState({ art: 'einmalig', rhythmus: '', fenster_tage: '', optional: false });
  const PHASES = [
    { value: 'input', label: 'Input' },
    { value: 'produktion', label: 'Produktion' },
    { value: 'pruefung', label: 'Interne Prüfung' },
    { value: 'kundenfeedback', label: 'Kundenfeedback' },
  ];

  const { data: roh = [] } = useQuery({
    queryKey: ['ticketTemplates', module.id],
    queryFn: () => base44.entities.TicketTemplate.filter({ module_template_id: module.id }, 'order', 200),
  });
  // Container: erst einmalige Vorlagen, dann Routinen
  const templates = istContainer
    ? [...roh.filter((t) => t.art !== 'routine'), ...roh.filter((t) => t.art === 'routine')]
    : roh;
  const ersteRoutine = istContainer ? templates.findIndex((t) => t.art === 'routine') : -1;

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
      ...(istContainer ? routineFelderAusForm(neuRoutine) : {}),
    });
    setNewTitle(''); setNewHours('');
    refresh();
  };

  const handleMove = async (idx, dir) => {
    const other = idx + dir;
    if (other < 0 || other >= templates.length) return;
    await base44.entities.TicketTemplate.bulkUpdate(istContainer
      ? [
        { id: templates[idx].id, order: templates[other].order ?? other + 1 },
        { id: templates[other].id, order: templates[idx].order ?? idx + 1 },
      ]
      : [
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
      <ModulKopfFelder module={module} onChanged={onModuleChanged} onDeleted={onModuleDeleted} />

      <div className="space-y-1.5">
        {templates.map((t, idx) => (
          <React.Fragment key={t.id}>
            {idx > 0 && idx === ersteRoutine && <div className="border-t border-border my-2" />}
            <TicketTemplateZeile
              template={t}
              index={idx}
              letzte={idx === templates.length - 1}
              phasen={PHASES}
              istContainer={istContainer}
              onMove={handleMove}
              onDelete={handleDelete}
              onChanged={refresh}
            />
          </React.Fragment>
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
        {istContainer ? <RoutineVorlageFelder form={neuRoutine} setForm={setNeuRoutine} /> : (
          <Select value={newPhase} onValueChange={setNewPhase}>
            <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>{PHASES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Input type="number" placeholder="Soll-h" className="sm:w-24" value={newHours} onChange={(e) => setNewHours(e.target.value)} />
        <Button className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded" disabled={!newTitle} onClick={handleAdd}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}