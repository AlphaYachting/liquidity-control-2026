import React from 'react';
import { Phone, Mail, CalendarDays, StickyNote, GitCommitHorizontal, Bot } from 'lucide-react';

const TYPE_META = {
  call: { icon: Phone, label: 'Anruf', color: 'bg-blue-100 text-blue-600' },
  email: { icon: Mail, label: 'E-Mail', color: 'bg-sky-100 text-sky-600' },
  meeting: { icon: CalendarDays, label: 'Termin', color: 'bg-violet-100 text-violet-600' },
  note: { icon: StickyNote, label: 'Notiz', color: 'bg-amber-100 text-amber-600' },
  stage_change: { icon: GitCommitHorizontal, label: 'Phase', color: 'bg-emerald-100 text-emerald-600' },
  system: { icon: Bot, label: 'System', color: 'bg-muted text-muted-foreground' },
};

export default function ActivityTimeline({ activities }) {
  if (!activities?.length) {
    return <p className="text-sm text-muted-foreground text-center py-6">Noch keine Aktivitäten erfasst.</p>;
  }
  return (
    <div className="space-y-0">
      {activities.map((a, i) => {
        const meta = TYPE_META[a.activity_type] || TYPE_META.note;
        const Icon = meta.icon;
        return (
          <div key={a.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`p-1.5 rounded-full ${meta.color} shrink-0`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              {i < activities.length - 1 && <div className="w-px flex-1 bg-border my-1" />}
            </div>
            <div className="pb-5 min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-medium leading-tight">{a.title || meta.label}</p>
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {new Date(a.activity_date || a.created_date).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {a.content && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{a.content}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}