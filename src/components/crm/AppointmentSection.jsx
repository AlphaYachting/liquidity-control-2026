import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CalendarPlus, Check, X } from 'lucide-react';
import StatusEtikett from '@/components/shared/StatusEtikett';

const STATUS_META = {
  proposed: { ton: 'info', text: 'Vorgeschlagen' },
  confirmed: { ton: 'done', text: 'Bestätigt' },
  declined: { ton: 'neutral', text: 'Abgelehnt' },
  cancelled: { ton: 'neutral', text: 'Abgesagt' },
  completed: { ton: 'done', text: 'Stattgefunden' },
};

export default function AppointmentSection({ deal, appointments, onChanged }) {
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
        <h3 className="text-value">Termine</h3>
        <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
          <CalendarPlus /> Termin
        </Button>
      </div>
      {adding && (
        <div className="border rounded-lg p-2.5 bg-muted/30 space-y-2">
          <Input className="h-8 text-sm" placeholder="Titel (z.B. Erstgespräch)" value={title} onChange={e => setTitle(e.target.value)} />
          <Input className="h-8 text-sm" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} />
          <Button size="sm" className="w-full h-8" onClick={create} disabled={!when}>Termin vorschlagen</Button>
        </div>
      )}
      {(!appointments || appointments.length === 0) && !adding && (
        <p className="text-meta text-muted-foreground">Keine Termine.</p>
      )}
      {appointments?.map(a => (
        <div key={a.id} className="border rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-body font-medium truncate">{a.title || 'Termin'}</p>
            <StatusEtikett ton={(STATUS_META[a.status] || STATUS_META.proposed).ton}>
              {(STATUS_META[a.status] || STATUS_META.proposed).text}
            </StatusEtikett>
          </div>
          <p className="text-xs text-muted-foreground">
            {new Date(a.scheduled_at).toLocaleString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
          {a.status === 'proposed' && (
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatus(a, 'confirmed')}>
                <Check /> Bestätigt
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setStatus(a, 'cancelled')}>
                <X /> Abgesagt
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}