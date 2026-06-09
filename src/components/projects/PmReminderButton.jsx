import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell, BellRing, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const DEFAULT_REASON = 'Ist diese geplante Verrechnung nun abrechenbar?';

const REMINDER_STATUS_OPTIONS = [
  { value: 'open', label: 'Offen' },
  { value: 'checked', label: 'Geprüft' },
  { value: 'postponed', label: 'Verschoben' },
  { value: 'converted_to_instruction', label: 'Erledigt' },
];

function isDue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr) <= new Date();
}

export default function PmReminderButton({ project, selectedPlanId }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    reminder_date: '',
    reminder_reason: DEFAULT_REASON,
    reminder_status: 'open',
  });

  const { data: plans = [] } = useQuery({
    queryKey: ['monthlyBillingPlans', project.id],
    queryFn: () => base44.entities.MonthlyBillingPlan.filter({ project_id: project.id }),
  });

  // Find the most relevant plan: selected > current/next month with existing reminder > newest
  const today = new Date();
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, '0')}`;

  const selectedPlan = selectedPlanId ? plans.find(p => p.id === selectedPlanId) : null;
  const currentMonthPlan = plans.find(p => p.planning_month === currentMonth);
  const nextMonthPlan = plans.find(p => p.planning_month === nextMonth);
  const activePlan = selectedPlan || currentMonthPlan || nextMonthPlan || plans[0] || null;

  // Check if any plan has a due reminder
  const duePlan = plans.find(p => p.reminder_date && isDue(p.reminder_date) && p.reminder_status === 'open');
  // Check if any plan has a future (active but not yet due) reminder
  const activeFutureReminder = !duePlan && plans.find(p => p.reminder_date && !isDue(p.reminder_date) && p.reminder_status === 'open');

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.MonthlyBillingPlan.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlans', project.id] });
      setOpen(false);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.MonthlyBillingPlan.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['monthlyBillingPlans', project.id] });
      setOpen(false);
    }
  });

  const handleSave = () => {
    if (!form.reminder_date) return;
    if (activePlan) {
      updateMutation.mutate({
        id: activePlan.id,
        data: {
          reminder_date: form.reminder_date,
          reminder_reason: form.reminder_reason,
          reminder_status: form.reminder_status,
        }
      });
    } else {
      // Create a new plan for current month
      createMutation.mutate({
        project_id: project.id,
        planning_month: currentMonth,
        planning_type: 'current_month',
        planned_invoice_type: 'TR',
        planned_percent: 0,
        planned_amount_net: 0,
        planned_amount_gross: 0,
        billing_status: 'open',
        reminder_date: form.reminder_date,
        reminder_reason: form.reminder_reason,
        reminder_status: form.reminder_status,
        assigned_pm: project.project_manager || '',
      });
    }
  };

  const handleOpen = () => {
    // Pre-fill from activePlan if it has a reminder
    if (activePlan?.reminder_date) {
      setForm({
        reminder_date: activePlan.reminder_date,
        reminder_reason: activePlan.reminder_reason || DEFAULT_REASON,
        reminder_status: activePlan.reminder_status || 'open',
      });
    } else {
      setForm({ reminder_date: '', reminder_reason: DEFAULT_REASON, reminder_status: 'open' });
    }
    setOpen(true);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className={`h-8 text-xs flex items-center gap-1.5 ${duePlan ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100' : 'border-border text-muted-foreground hover:text-foreground'}`}
          onClick={handleOpen}
        >
          {duePlan ? <BellRing className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
          Erinnerung an PM
          {activeFutureReminder && (
            <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" title={`Erinnerung aktiv: ${activeFutureReminder.reminder_date}`} />
          )}
        </Button>
        {duePlan && (
          <Badge className="text-xs bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
            Prüfung fällig
          </Badge>
        )}
      </div>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 bg-card border rounded-xl shadow-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5 text-primary" />
              Erinnerung setzen
            </p>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          {activePlan && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-2 py-1">
              Wird gespeichert auf: {activePlan.planning_month}
            </p>
          )}

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Erinnerungsdatum</label>
            <Input
              type="date"
              value={form.reminder_date}
              onChange={e => setForm(f => ({ ...f, reminder_date: e.target.value }))}
              className="h-7 text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Grund / Frage</label>
            <textarea
              value={form.reminder_reason}
              onChange={e => setForm(f => ({ ...f, reminder_reason: e.target.value }))}
              rows={2}
              className="w-full text-xs border rounded-lg p-2 resize-none bg-background"
              placeholder={DEFAULT_REASON}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={form.reminder_status} onValueChange={v => setForm(f => ({ ...f, reminder_status: v }))}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REMINDER_STATUS_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-7 text-xs flex-1"
              disabled={!form.reminder_date || isPending}
              onClick={handleSave}>
              {isPending ? 'Speichert…' : 'Speichern'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs"
              onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}