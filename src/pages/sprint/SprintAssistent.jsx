import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import StepModule, { milestoneAmount } from '@/components/sprint/assistent/StepModule';
import { SPRINT_SIZES, fmtEUR, fmtDate, addWeeks } from '@/components/sprint/sprintConfig';
import { planSprintDeadlines } from '@/lib/sprint/deadlines';
import { verteileNachlass } from '@/lib/sprint/nachlass';
import { resolveAssignee } from '@/lib/sprint/assignment';

// S6 — Sprint anlegen: Beträge, Kennzahlen und alle Plantermine werden gerechnet, nicht getippt.
export default function SprintAssistent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [projectId, setProjectId] = useState('');
  const [size, setSize] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [discount, setDiscount] = useState('');
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const { data } = useQuery({
    queryKey: ['sprintAssistentData'],
    queryFn: async () => {
      const [projects, modules, addOns, members, settings] = await Promise.all([
        base44.entities.Project.list('-created_date', 200),
        base44.entities.ModuleTemplate.list('-created_date', 200),
        base44.entities.AddOnBlock.list('-created_date', 200),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.Setting.filter({ group: 'fristen' }, 'key', 100),
      ]);
      return {
        projects: projects.filter((p) => p.status === 'aktiv'),
        modules: modules.filter((m) => m.active !== false),
        addOns: addOns.filter((a) => a.active !== false),
        members, settings,
      };
    },
  });

  const projects = data?.projects || [];
  const modules = data?.modules || [];
  const addOns = data?.addOns || [];
  const members = data?.members || [];
  const settings = data?.settings || [];
  const project = projects.find((p) => p.id === projectId);

  const step1Valid = projectId && size && startDate && deliveryDate;
  const etappenSumme = selected.reduce((s, m) => s + milestoneAmount(m, addOns), 0);
  const sprintAmount = Math.round(etappenSumme - (Number(discount) || 0));
  // S1 — Nachlass anteilig eingerechnet: Summe der Etappenbeträge = Sprintbetrag
  const nettoBetraege = verteileNachlass(selected.map((m) => milestoneAmount(m, addOns)), Number(discount) || 0);
  const step2Valid = selected.length > 0 && sprintAmount > 0;

  // Kennzahlen aus dem Katalog rechnen — nie von Hand eintragen
  const kennzahlen = selected.reduce((acc, m) => {
    const mod = modules.find((x) => x.id === m.module_template_id);
    const addonHours = m.addon_ids.reduce((s, id) => s + (Number(addOns.find((a) => a.id === id)?.target_hours) || 0), 0);
    acc.hours += (Number(mod?.target_hours) || 0) + addonHours;
    acc.focusDays += Number(mod?.target_focus_days) || 0;
    return acc;
  }, { hours: 0, focusDays: 0 });

  const plan = step1Valid && selected.length
    ? planSprintDeadlines({ startDate, deliveryDate, size, milestoneCount: selected.length, settings })
    : null;

  const handleCreate = async () => {
    if (!plan?.deliverable) return;
    const nettoSumme = nettoBetraege.reduce((s, n) => s + n, 0);
    if (nettoSumme !== sprintAmount) {
      setCreateError(`Die Etappenbeträge (${fmtEUR(nettoSumme)}) ergeben nicht den Sprintbetrag (${fmtEUR(sprintAmount)}). Der Sprint wurde nicht angelegt.`);
      return;
    }
    setCreateError('');
    setCreating(true);
    const now = new Date().toISOString();
    const sprint = await base44.entities.Sprint.create({
      project_id: projectId,
      title: `${project?.title || 'Sprint'} — Sprint ${size}`,
      size,
      start_date: startDate,
      end_date: addWeeks(startDate, SPRINT_SIZES[size].weeks),
      delivery_date: deliveryDate,
      sprint_amount: sprintAmount,
      discount: Number(discount) || 0,
      target_hours: kennzahlen.hours,
      planned_focus_days: kennzahlen.focusDays,
      status: 'geplant',
      successor_offered: false,
    });

    for (let i = 0; i < selected.length; i++) {
      const sel = selected[i];
      const mod = modules.find((x) => x.id === sel.module_template_id);
      const milestone = await base44.entities.Milestone.create({
        sprint_id: sprint.id,
        order: i + 1,
        module_template_id: sel.module_template_id,
        title: sel.name,
        state: 'input',
        milestone_amount: nettoBetraege[i],
        planned_handover: plan.plan[i].planned_handover,
        planned_freeze: plan.plan[i].planned_freeze,
        deadline_pulled_forward: plan.plan[i].pulled_forward,
        planned_focus_days: Number(mod?.target_focus_days) || 0,
        is_final_milestone: i === selected.length - 1,
        released: false,
      });

      const templates = await base44.entities.TicketTemplate.filter({ module_template_id: sel.module_template_id }, 'order', 200);
      const tickets = templates.map((t, idx) => ({
        milestone_id: milestone.id,
        project_id: projectId,
        order: idx + 1,
        title: t.title,
        role: t.role,
        assignee_email: resolveAssignee(t.role, members),
        milestone_state: t.milestone_state || 'produktion',
        blocks_others: t.blocks_others || false,
        status: 'offen',
        origin: 'pflicht',
        target_hours: t.target_hours || 0,
        last_status_change: now,
      }));

      let order = tickets.length;
      for (const addonId of sel.addon_ids) {
        const addonTickets = await base44.entities.AddOnTicketTemplate.filter({ add_on_block_id: addonId }, 'order', 100);
        addonTickets.forEach((t) => {
          order += 1;
          tickets.push({
            milestone_id: milestone.id, project_id: projectId, order,
            title: t.title, role: t.role,
            assignee_email: resolveAssignee(t.role, members),
            milestone_state: t.milestone_state || 'produktion',
            blocks_others: t.blocks_others || false,
            status: 'offen', origin: 'addon',
            target_hours: t.target_hours || 0, last_status_change: now,
          });
        });
      }
      if (tickets.length) await base44.entities.Ticket.bulkCreate(tickets);
    }

    navigate(`/sprint/sprints/${sprint.id}`);
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-5">
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Sprint anlegen</h1>

      <div>
        <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          <span className={step >= 1 ? 'text-primary' : ''}>1 · Rahmen</span>
          <span className={step >= 2 ? 'text-primary' : ''}>2 · Module</span>
          <span className={step >= 3 ? 'text-primary' : ''}>3 · Übersicht</span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${(step / 3) * 100}%` }} />
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
                      size === s.label ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-primary/40'
                    }`}
                  >
                    <div className="text-2xl font-extrabold text-foreground">{s.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">{s.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4 max-w-2xl">
              <div><Label>Startdatum</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
              <div><Label>Liefertermin</Label><Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
              <div>
                <Label>Nachlass (EUR)</Label>
                <Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Der Sprintbetrag ergibt sich aus den gewählten Modulen und Bausteinen abzüglich Nachlass.
            </p>
          </div>
        )}

        {step === 2 && (
          <StepModule modules={modules} addOns={addOns} selected={selected} setSelected={setSelected} discount={discount} />
        )}

        {step === 3 && (
          <div className="space-y-4">
            <SectionLabel>Übersicht</SectionLabel>
            <div className="text-sm text-foreground">
              <p className="font-bold">{project?.title} · Sprint {size}</p>
              <p className="text-muted-foreground">
                {fmtDate(startDate)} bis {fmtDate(addWeeks(startDate, SPRINT_SIZES[size]?.weeks || 0))} · Liefertermin {fmtDate(deliveryDate)} · {fmtEUR(sprintAmount)}
              </p>
              <p className="text-muted-foreground">
                {kennzahlen.hours} Sollstunden · {kennzahlen.focusDays} Focus-Tage (aus dem Katalog gerechnet)
              </p>
            </div>

            {plan && !plan.deliverable && (
              <div className="flex gap-3 rounded border border-primary bg-primary/5 p-4">
                <AlertTriangle className="w-5 h-5 text-primary shrink-0" />
                <div className="text-sm text-foreground">
                  <p className="font-bold">Sprint nicht lieferbar</p>
                  <p>{plan.reason} Frühester realistischer Liefertermin: {fmtDate(plan.suggestedDelivery)}.</p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {selected.map((m, idx) => (
                <div key={m.key} className="flex flex-wrap items-center gap-3 bg-muted rounded px-4 py-3">
                  <span className="text-xs font-bold text-primary">{idx + 1}</span>
                  <span className="flex-1 min-w-[180px] text-sm font-semibold text-foreground">
                    {m.name}
                    {idx === selected.length - 1 && <span className="text-[11px] text-muted-foreground font-normal ml-2">(finaler Milestone)</span>}
                  </span>
                  {plan?.deliverable && (
                    <span className="text-xs text-muted-foreground">
                      Übergabe {fmtDate(plan.plan[idx].planned_handover)} · Freeze {fmtDate(plan.plan[idx].planned_freeze)}
                    </span>
                  )}
                  <span className="text-sm font-bold text-foreground">{fmtEUR(nettoBetraege[idx])}</span>
                </div>
              ))}
            </div>

            {Number(discount) > 0 && (
              <p className="text-[13px] text-muted-foreground">Nachlass {fmtEUR(Number(discount))} bereits eingerechnet.</p>
            )}
            {createError && <p className="text-sm text-status-critical">{createError}</p>}
          </div>
        )}

        <div className="flex justify-between mt-6 pt-4 border-t border-muted">
          <Button variant="outline" className="rounded" disabled={step === 1 || creating} onClick={() => setStep(step - 1)}>
            Zurück
          </Button>
          {step < 3 ? (
            <Button
              className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded"
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              onClick={() => setStep(step + 1)}
            >
              Weiter
            </Button>
          ) : (
            <Button
              className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded"
              disabled={creating || !plan?.deliverable} onClick={handleCreate}
            >
              {creating ? 'Legt an…' : 'Sprint anlegen'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}