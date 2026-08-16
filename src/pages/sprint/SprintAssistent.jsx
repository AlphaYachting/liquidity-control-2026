import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';
import SectionLabel from '@/components/sprint/SectionLabel';
import StepModule, { milestoneAmount } from '@/components/sprint/assistent/StepModule';
import StepRahmen, { rahmenValid, NEW_CLIENT } from '@/components/sprint/assistent/StepRahmen';
import { PROJECT_TYPES } from '@/components/sprint/projectTypes';
import { ensureContainer } from '@/lib/sprint/ensureContainer';
import { SPRINT_SIZES, fmtEUR, fmtDate, addWeeks } from '@/components/sprint/sprintConfig';
import { planSprintDeadlines } from '@/lib/sprint/deadlines';
import { verteileNachlass } from '@/lib/sprint/nachlass';
import { resolveAssignee } from '@/lib/sprint/assignment';

const EMPTY_SEED = {
  client_id: '', new_client_name: '', new_client_email: '',
  type: '', pm_email: '', title: '',
  sprint_target: 'neu', existing_project_id: '',
};

// Allgemeiner Anlage-Wizard: Schritt 1 Rahmen für alle Typen, danach die
// Sprintplanung nur für Sprintprojekte. Beträge und Termine werden gerechnet.
export default function SprintAssistent() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [seed, setSeed] = useState(EMPTY_SEED);
  const [size, setSize] = useState('');
  const [startDate, setStartDate] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [discount, setDiscount] = useState('');
  const [selected, setSelected] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const { data, refetch } = useQuery({
    queryKey: ['sprintAssistentData'],
    queryFn: async () => {
      const [clients, projects, modules, addOns, members, settings] = await Promise.all([
        base44.entities.Client.list('name', 300),
        base44.entities.Project.list('-created_date', 200),
        base44.entities.ModuleTemplate.list('-created_date', 200),
        base44.entities.AddOnBlock.list('-created_date', 200),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.Setting.filter({ group: 'fristen' }, 'key', 100),
      ]);
      return {
        clients,
        projects: projects.filter((p) => p.status === 'aktiv'),
        modules: modules.filter((m) => m.active !== false),
        addOns: addOns.filter((a) => a.active !== false),
        members, settings,
      };
    },
  });

  const clients = data?.clients || [];
  const projects = data?.projects || [];
  const modules = data?.modules || [];
  const addOns = data?.addOns || [];
  const members = data?.members || [];
  const settings = data?.settings || [];

  const isSprint = seed.type === 'sprint';
  const stepLabels = isSprint
    ? ['Rahmen', 'Sprint', 'Module', 'Übersicht']
    : ['Rahmen', 'Anlegen'];
  const lastStep = stepLabels.length;

  const sprintRahmenValid = size && startDate && deliveryDate;
  const etappenSumme = selected.reduce((s, m) => s + milestoneAmount(m, addOns), 0);
  const sprintAmount = Math.round(etappenSumme - (Number(discount) || 0));
  const nettoBetraege = verteileNachlass(selected.map((m) => milestoneAmount(m, addOns)), Number(discount) || 0);
  const moduleValid = selected.length > 0 && sprintAmount > 0;

  const kennzahlen = selected.reduce((acc, m) => {
    const mod = modules.find((x) => x.id === m.module_template_id);
    const addonHours = m.addon_ids.reduce((s, id) => s + (Number(addOns.find((a) => a.id === id)?.target_hours) || 0), 0);
    acc.hours += (Number(mod?.target_hours) || 0) + addonHours;
    acc.focusDays += Number(mod?.target_focus_days) || 0;
    return acc;
  }, { hours: 0, focusDays: 0 });

  const plan = sprintRahmenValid && selected.length
    ? planSprintDeadlines({ startDate, deliveryDate, size, milestoneCount: selected.length, settings })
    : null;

  const nextDisabled =
    (step === 1 && !rahmenValid(seed)) ||
    (isSprint && step === 2 && !sprintRahmenValid) ||
    (isSprint && step === 3 && !moduleValid);

  // Neuer Kunde entsteht inline beim Verlassen des Rahmens
  const handleNext = async () => {
    if (step === 1 && seed.client_id === NEW_CLIENT) {
      setCreating(true);
      const client = await base44.entities.Client.create({
        name: seed.new_client_name.trim(),
        contact_email: seed.new_client_email || '',
      });
      setSeed((s) => ({ ...s, client_id: client.id }));
      await refetch();
      setCreating(false);
    }
    setStep(step + 1);
  };

  const resolveProject = async () => {
    if (isSprint && seed.sprint_target === 'folge') {
      return projects.find((p) => p.id === seed.existing_project_id);
    }
    const def = PROJECT_TYPES[seed.type];
    return base44.entities.Project.create({
      client_id: seed.client_id,
      title: seed.title.trim(),
      pm_email: seed.pm_email,
      status: 'aktiv',
      abrechnungsmodell: def.model || 'aufwand',
      is_legacy: seed.type === 'legacy',
    });
  };

  // Laufender Behälter für alle Typen außer Sprint — ohne Termin, ohne Betrag
  const handleCreateContainer = async () => {
    setCreating(true);
    const project = await resolveProject();
    await ensureContainer(project);
    navigate('/sprint/projekte');
  };

  const handleCreateSprint = async () => {
    if (!plan?.deliverable) return;
    const nettoSumme = nettoBetraege.reduce((s, n) => s + n, 0);
    if (nettoSumme !== sprintAmount) {
      setCreateError(`Die Etappenbeträge (${fmtEUR(nettoSumme)}) ergeben nicht den Sprintbetrag (${fmtEUR(sprintAmount)}). Der Sprint wurde nicht angelegt.`);
      return;
    }
    setCreateError('');
    setCreating(true);
    const project = await resolveProject();
    const projectId = project.id;
    const now = new Date().toISOString();
    const sprint = await base44.entities.Sprint.create({
      project_id: projectId,
      title: `${project.title || 'Sprint'} — Sprint ${size}`,
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
      <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground">Neu anlegen</h1>

      <div>
        <div className="flex justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
          {stepLabels.map((label, idx) => (
            <span key={label} className={step >= idx + 1 ? 'text-primary' : ''}>{idx + 1} · {label}</span>
          ))}
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${(step / lastStep) * 100}%` }} />
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6">
        {step === 1 && (
          <StepRahmen seed={seed} setSeed={setSeed} clients={clients} members={members} projects={projects} />
        )}

        {!isSprint && step === 2 && (
          <div className="space-y-3">
            <SectionLabel>Übersicht</SectionLabel>
            <p className="text-sm text-foreground font-bold">
              {seed.title} · {PROJECT_TYPES[seed.type]?.label}
            </p>
            <p className="text-sm text-muted-foreground">
              Kunde: {clients.find((c) => c.id === seed.client_id)?.name || '—'} · PM: {seed.pm_email}
            </p>
            <p className="text-xs text-muted-foreground">
              Es entsteht ein laufender Behälter mit offener Etappe — ohne Liefertermin und ohne Etappenbetrag.
              Tickets können sofort abgelegt werden.
            </p>
          </div>
        )}

        {isSprint && step === 2 && (
          <div className="space-y-5">
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

        {isSprint && step === 3 && (
          <StepModule modules={modules} addOns={addOns} selected={selected} setSelected={setSelected} discount={discount} />
        )}

        {isSprint && step === 4 && (
          <div className="space-y-4">
            <SectionLabel>Übersicht</SectionLabel>
            <div className="text-sm text-foreground">
              <p className="font-bold">{seed.title} · Sprint {size}</p>
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
          {step < lastStep ? (
            <Button
              className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded"
              disabled={nextDisabled || creating}
              onClick={handleNext}
            >
              Weiter
            </Button>
          ) : (
            <Button
              className="bg-primary hover:bg-primary/90 text-white font-bold uppercase rounded"
              disabled={creating || (isSprint && !plan?.deliverable)}
              onClick={isSprint ? handleCreateSprint : handleCreateContainer}
            >
              {creating ? 'Legt an…' : isSprint ? 'Sprint anlegen' : 'Projekt anlegen'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}