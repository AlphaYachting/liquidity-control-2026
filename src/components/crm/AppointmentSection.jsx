import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarPlus, Check, X } from 'lucide-react';

const STATUS_BADGE = {
  proposed: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  cancelled: 'bg-muted text-muted-foreground',
  completed: 'bg-emerald-100 text-emerald-700',
};
const STATUS_LABEL = {
  proposed: 'Vorgeschlagen', confirmed: 'Bestätigt ✓', declined: 'Abgelehnt',
  cancelled: 'Abgesagt', completed: 'Stattgefunden ✓',
};

export default function AppointmentSection({ deal, appointments, onChanged, onTerminVorschlagen }) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState('');

  const logActivity = (title, content) => base44.entities.CrmActivity.create({
    deal_id: deal.id, activity_type: 'meeting', title, content, activity_date: new Date().toISOString(),
  });

  const create = async () => {
    if (!when) return;
    const whenLabel = new Date(when).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    await base44.entities.CrmAppointment.create({
      deal_id: deal.id,
      title: title || 'Erstgespräch',
      scheduled_at: new Date(when).toISOString(),
      status: 'proposed',
    });
    await logActivity('Termin vorgeschlagen', `${title || 'Erstgespräch'} · ${whenLabel}`);
    if (deal.pipeline === 'new_business' && ['new_lead', 'contacted'].includes(deal.stage)) {
      await base44.entities.CrmDeal.update(deal.id, { stage: 'meeting_scheduled' });
    }
    setAdding(false); setTitle(''); setWhen('');
    onChanged?.();
  };

  const setStatus = async (appt, status) => {
    await base44.entities.CrmAppointment.update(appt.id, {
      status,
      ...(status === 'confirmed' ? { confirmed_at: new Date().toISOString(), confirmation_source: 'manual' } : {}),
    });
    await logActivity(status === 'confirmed' ? 'Termin bestätigt' : 'Termin abgesagt', appt.title || 'Termin');
    // Ein bestätigter Termin schließt die übrigen Vorschläge desselben Versands
    if (status === 'confirmed' && appt.proposal_group_id) {
      const gruppe = (appointments || []).filter(
        (a) => a.proposal_group_id === appt.proposal_group_id && a.id !== appt.id && a.status === 'proposed',
      );
      for (const a of gruppe) await base44.entities.CrmAppointment.update(a.id, { status: 'cancelled' });
    }
    if (status === 'confirmed' && deal.stage === 'meeting_scheduled') {
      await base44.entities.CrmDeal.update(deal.id, { stage: 'meeting_confirmed' });
    }
    onChanged?.();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Termine</h3>
        <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={() => onTerminVorschlagen?.()}>
          <CalendarPlus className="w-3 h-3" /> Termin
        </Button>
      </div>
      {!adding && (
        <button type="button" onClick={() => setAdding(true)} className="text-[11px] text-muted-foreground hover:text-foreground underline">
          Termin ohne E-Mail eintragen
        </button>
      )}
      {adding && (
        <div className="border rounded-lg p-2.5 bg-muted/30 space-y-2">
          <Input className="h-8 text-sm" placeholder="Titel (z.B. Erstgespräch)" value={title} onChange={e => setTitle(e.target.value)} />
          <Input className="h-8 text-sm" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
          <Button size="sm" className="w-full h-8" onClick={create} disabled={!when}>Termin vorschlagen</Button>
        </div>
      )}
      {(!appointments || appointments.length === 0) && !adding && (
        <p className="text-xs text-muted-foreground">Keine Termine.</p>
      )}
      {appointments?.map(a => (
        <div key={a.id} className="border rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">{a.title || 'Termin'}</p>
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${STATUS_BADGE[a.status]}`}>
              {STATUS_LABEL[a.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(a.scheduled_at).toLocaleString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          {a.status === 'proposed' && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                onClick={() => setStatus(a, 'confirmed')}>
                <Check className="w-3 h-3" /> Bestätigt
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1 flex-1 text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => setStatus(a, 'cancelled')}>
                <X className="w-3 h-3" /> Abgesagt
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}