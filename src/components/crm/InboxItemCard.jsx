import React from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Phone, Mail, PenLine, UserPlus, Trash2 } from 'lucide-react';

const SOURCE_META = {
  phone_ai: { icon: Phone, label: 'Telefon-KI', color: 'bg-violet-100 text-violet-600' },
  email: { icon: Mail, label: 'E-Mail', color: 'bg-blue-100 text-blue-600' },
  manual: { icon: PenLine, label: 'Manuell', color: 'bg-muted text-muted-foreground' },
};

export default function InboxItemCard({ item, onConvert, onChanged }) {
  const meta = SOURCE_META[item.source] || SOURCE_META.manual;
  const Icon = meta.icon;

  const dismiss = async () => {
    await base44.entities.CrmInboxItem.update(item.id, { status: 'dismissed' });
    onChanged?.();
  };

  return (
    <div className="border rounded-xl p-4 bg-card shadow-sm space-y-2">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${meta.color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-semibold truncate">{item.subject || 'Anfrage ohne Betreff'}</p>
            <span className="text-[11px] text-muted-foreground shrink-0">
              {new Date(item.received_at || item.created_date).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {[item.sender_name, item.sender_email, item.sender_phone].filter(Boolean).join(' · ') || 'Unbekannter Absender'}
          </p>
          {item.matched_customer_name && (
            <span className="inline-block mt-1 text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
              Bestandskunde: {item.matched_customer_name}
            </span>
          )}
        </div>
      </div>
      {item.body && <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 pl-12">{item.body}</p>}
      <div className="flex gap-2 pl-12">
        <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => onConvert(item)}>
          <UserPlus className="w-3.5 h-3.5" /> Lead / Deal anlegen
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" onClick={dismiss}>
          <Trash2 className="w-3.5 h-3.5" /> Verwerfen
        </Button>
      </div>
    </div>
  );
}