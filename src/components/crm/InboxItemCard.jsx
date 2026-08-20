import React, { useState } from 'react';
import { Phone, Mail, PenLine, UserPlus, Trash2, MailCheck, Link2, LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import InboxItemBody from '@/components/crm/InboxItemBody';
import InboxDismissDialog from '@/components/crm/InboxDismissDialog';
import { decideInboxItem } from '@/components/crm/inboxDecision';
import { INQUIRY_TYPE_LABELS, STRENGTH_META, parseSignal } from '@/components/crm/inboxSignals';
import InboxSuggestionLabel from '@/components/crm/InboxSuggestionLabel';

const SOURCE_META = {
  phone_ai: { icon: Phone, label: 'Telefon-KI', color: 'bg-violet-100 text-violet-600' },
  email: { icon: Mail, label: 'E-Mail', color: 'bg-blue-100 text-blue-600' },
  manual: { icon: PenLine, label: 'Manuell', color: 'bg-muted text-muted-foreground' },
};

export default function InboxItemCard({ item, onConvert, onAssign, onSupportTicket, onChanged }) {
  const suggestion = item.suggested_action || (item.track === 'support' ? 'supportticket' : 'anfrage');
  const meta = SOURCE_META[item.source] || SOURCE_META.manual;
  const Icon = meta.icon;
  const strength = STRENGTH_META[item.lead_strength];
  // Liegt die Anfrage länger als zwei Tage unbeantwortet, wird die ganze Karte rot markiert
  const tageOffen = Math.floor(
    (Date.now() - new Date(item.received_at || item.created_date).getTime()) / 86400000,
  );
  const ueberfaellig = tageOffen >= 2;
  const [dismissOpen, setDismissOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const decide = async (decision, reason = '') => {
    setBusy(true);
    try {
      await decideInboxItem(item, decision, reason);
      onChanged?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Aktion fehlgeschlagen',
        description: e?.response?.data?.detail || e?.message || 'Der Eintrag konnte nicht aktualisiert werden.',
      });
    }
    setBusy(false);
  };

  return (
    <div className={`border rounded-xl p-4 shadow-sm space-y-2 ${
      ueberfaellig ? 'border-status-critical bg-status-critical-surface' : 'bg-card'
    }`}>
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
            <span className="font-medium">Von:</span>{' '}
            {[item.sender_name, item.sender_email, item.sender_phone].filter(Boolean).join(' · ') || 'Unbekannter Absender'}
          </p>
          <p className="text-xs text-muted-foreground">
            <span className="font-medium">An:</span>{' '}
            {item.recipient || 'Empfänger nicht belegt'}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap mt-1">
            <InboxSuggestionLabel item={item} />
            {ueberfaellig && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full font-semibold bg-status-critical text-white">
                {tageOffen} Tage unbeantwortet
              </span>
            )}
            {strength && (
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${strength.color}`}>
                {strength.label} · {item.signal_count || 0} Signale
              </span>
            )}
            {item.inquiry_type && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {INQUIRY_TYPE_LABELS[item.inquiry_type] || item.inquiry_type}
              </span>
            )}
            {item.matched_customer_name && (
              <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                Bestandskunde: {item.matched_customer_name}
              </span>
            )}
          </div>
          {(item.buying_signals || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {item.buying_signals.map((raw, i) => {
                const s = parseSignal(raw);
                return (
                  <span key={i} title={s.evidence}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                    {s.label}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <InboxItemBody item={item} />
      <div className="flex flex-wrap gap-2 pl-12">
        <Button size="sm" variant={suggestion === 'supportticket' ? 'default' : 'outline'}
          className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => onSupportTicket?.(item)}>
          <LifeBuoy className="w-3.5 h-3.5" /> Supportticket anlegen
        </Button>
        <Button size="sm" variant={suggestion === 'anfrage' ? 'default' : 'outline'}
          className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => onConvert(item)}>
          <UserPlus className="w-3.5 h-3.5" /> Deal / Lead anlegen
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={busy}
          onClick={() => onAssign(item)}>
          <Link2 className="w-3.5 h-3.5" /> Zu Deal zuordnen
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={busy}
          onClick={() => decide('nur_antwort')}>
          <MailCheck className="w-3.5 h-3.5" /> Kein Deal / kein Lead
        </Button>
        <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground" disabled={busy}
          onClick={() => setDismissOpen(true)}>
          <Trash2 className="w-3.5 h-3.5" /> Erledigt (mit Grund)
        </Button>
      </div>

      <InboxDismissDialog open={dismissOpen} onOpenChange={setDismissOpen}
        onConfirm={(reason) => decide('verworfen', reason)} />
    </div>
  );
}