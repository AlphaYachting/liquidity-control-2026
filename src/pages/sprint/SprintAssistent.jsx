import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SectionLabel from '@/components/sprint/SectionLabel';
import StepModule from '@/components/sprint/assistent/StepModule';
import { SPRINT_SIZES, fmtEUR, fmtDate, addWeeks } from '@/components/sprint/sprintConfig';

// S6 — Sprint anlegen: Assistent in drei Schritten mit Fortschrittsbalken
export default function SprintAssistent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState('');
  const [size, setSize] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [amount, setAmount] = useState('');
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);

  const { data } = useQuery({
    queryKey: ['sprintAssistentData'],
    queryFn: async () => {
      const [projects, modules, addOns] = await Promise.all([
        base44.entities.Project.list('-created_date', 200),
        base44.entities.ModuleTemplate.list('-created_date', 200),
        base44.entities.AddOnBlock.list('-created_date', 200),
      ]);
      return {
        projects: projects.filter((p) => p.status === 'aktiv'),
        modules: modules.filter((m) => m.active !== false),
        addOns: addOns.filter((a) => a.active !== false),
      };
    },
  });

  const projects = data?.projects || [];
  const modules = data?.modules || [];
  const addOns = data?.addOns || [];
  const project = projects.find((p) => p.id === projectId);

  const step1Valid = projectId && size && startDate && deliveryDate && Number(amount) > 0;
  const sum = selected.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const step2Valid = selected.length > 0 && sum === Number(amount);

  const handleCreate = async () => {
    setCreating(true);
    const now = new Date().toISOString();
    const sprint = await base44.entities.Sprint.create({
      project_id: projectId,
      title: `${project?.title || 'Sprint'} — Sprint ${size}`,
      size,
      start_date: startDate,
      end_date: addWeeks(startDate, SPRINT_SIZES[size].weeks),
      delivery_date: deliveryDate,
      sprint_amount: Number(amount),
      status: 'geplant',
      successor_offered: false,
    });

    for (let i = 0; i < selected.length; i++) {
      const sel = selected[i];
      const milestone = await base44.entities.Milestone.create({
        sprint_id: sprint.id,
        order: i + 1,
        module_template_id: sel.module_template_id,
        title: sel.name,
        state: 'input',
        milestone_amount: Number(sel.amount) || 0,
        is_final_milestone: i === selected.length - 1,
        invoice_triggered: false,
      });

      const templates = await base44.entities.TicketTemplate.filter({ module_template_id: sel.module_template_id }, 'order', 200);
      const tickets = templates.map((t, idx) => ({
        milestone_id: milestone.id,
        project_id: projectId,
        order: idx + 1,
        title: t.title,
        role: t.role,
        status: 'offen',
        origin: 'pflicht',
        target_hours: t.target_hours || 0,
        last_status_change: now,
      }));
      let orderOffset = tickets.length;
      for (const addonId of sel.addon_ids) {
        const block = addOns.find((a) => a.id === addonId);
        (block?.ticket_titles || []).forEach((title) => {
          orderOffset += 1;
          tickets.push({
            milestone_id: milestone.id, project_id: projectId, order: orderOffset,
            title, status: 'offen', origin: 'addon', last_status_change: now,
          });
        });
      }
      if (tickets.length) await base44.entities.Ticket.bulkCreate(tickets);
    }

    navigate(`/sprint/sprints/${sprint.id}`);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-[#2d2d2d]">Sprint anlegen</h1>

      {/* Fortschrittsbalken */}
      <div>
        <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-[#999999] mb-1.5">
          <span className={step >= 1 ? 'text-[#ff3764]' : ''}>1 · Rahmen</span>
          <span className={step >= 2 ? 'text-[#ff3764]' : ''}>2 · Module</span>
          <span className={step >= 3 ? 'text-[#ff3764]' : ''}>3 · Übersicht</span>
        </div>
        <div className="h-1.5 bg-[#f5f5f5] rounded-full overflow-hidden">
          <div className="h-full bg-[#ff3764] transition-all" style={{ width: `${(step / 3) * 100}%` }} />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <Label>Projekt</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="max-w-md"><SelectValue placeholder="Projekt wählen" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <SectionLabel className="mb-2">Sprintgröße</SectionLabel>
              <div className="grid grid-cols-3 gap-3 max-w-lg">
                {Object.values(SPRINT_SIZES).map((s) => (
                  <button
                    key={s.label} type="button" onClick={() => setSize(s.label)}
                    className={`rounded-lg p-5 text-center border-2 transition-colors ${
                      size === s.label ? 'border-[#ff3764] bg-[#ff3764]/5' : 'border-gray-200 bg-white hover:border-[#ff3764]/40'
                    }`}
                  >
                    <div className="text-2xl font-extrabold text-[#2d2d2d]">{s.label}</div>
                    <div className="text-xs text-[#999999] mt-1">{s.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
              <div><Label>Startdatum</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div><Label>Liefertermin</Label><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
              <div><Label>Sprintbetrag netto (EUR)</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            </div>
          </div>
        )}

        {step === 2 && (
          <StepModule modules={modules} addOns={addOns} selected={selected} setSelected={setSelected} sprintAmount={amount} />
        )}

        {step === 3 && (
          <div className="space-y-4">
            <SectionLabel>Übersicht</SectionLabel>
            <div className="text-sm text-[#2d2d2d]">
              <p className="font-bold">{project?.title} · Sprint {size}</p>
              <p className="text-[#999999]">
                {fmtDate(startDate)} bis {fmtDate(addWeeks(startDate, SPRINT_SIZES[size]?.weeks || 0))} · Liefertermin {fmtDate(deliveryDate)} · {fmtEUR(Number(amount))}
              </p>
            </div>
            <div className="space-y-2">
              {selected.map((m, idx) => (
                <div key={m.key} className="flex items-center gap-3 bg-[#f5f5f5] rounded px-4 py-3">
                  <span className="text-xs font-bold text-[#ff3764]">{idx + 1}</span>
                  <span className="flex-1 text-sm font-semibold text-[#2d2d2d]">
                    {m.name}
                    {idx === selected.length - 1 && <span className="text-[11px] text-[#999999] font-normal ml-2">(finaler Milestone)</span>}
                  </span>
                  {m.addon_ids.length > 0 && <span className="text-xs text-[#999999]">{m.addon_ids.length} Add-on(s)</span>}
                  <span className="text-sm font-bold text-[#2d2d2d]">{fmtEUR(Number(m.amount))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-between mt-6 pt-4 border-t border-[#f5f5f5]">
          <Button variant="outline" className="rounded" disabled={step === 1 || creating} onClick={() => setStep(step - 1)}>
            Zurück
          </Button>
          {step < 3 ? (
            <Button
              className="bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              onClick={() => setStep(step + 1)}
            >
              Weiter
            </Button>
          ) : (
            <Button
              className="bg-[#ff3764] hover:bg-[#e62e58] text-white font-bold uppercase rounded"
              disabled={creating} onClick={handleCreate}
            >
              {creating ? 'Legt an…' : 'Sprint anlegen'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}