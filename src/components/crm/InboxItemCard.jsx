import React, { useState } from 'react';
import { Phone, Mail, PenLine, UserPlus, MailCheck, Link2, LifeBuoy, Sparkles, ChevronDown, Check, Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { TON_STREIFEN } from '@/lib/designTon';
import InboxItemBody from '@/components/crm/InboxItemBody';
import InboxDismissDialog from '@/components/crm/InboxDismissDialog';
import LeadStaerke from '@/components/crm/LeadStaerke';
import { decideInboxItem } from '@/components/crm/inboxDecision';
import { INQUIRY_TYPE_LABELS, parseSignal } from '@/components/crm/inboxSignals';
import { suggestionMeta } from '@/components/crm/InboxSuggestionLabel';

const SOURCE_ICON = { phone_ai: Phone, email: Mail, manual: PenLine };
const HERKUNFT = { email: 'Nachricht · E-Mail', phone_ai: 'Gesprächsnotiz · Telefon-KI', manual: 'Manuell erfasst' };
const KORREKTUREN = [
  { label: 'Neue Anfrage', patch: { suggested_action: 'anfrage', is_known_customer: false } },
  { label: 'Bestandskunde-Anfrage', patch: { suggested_action: 'anfrage', is_known_customer: true } },
  { label: 'Supportticket', patch: { suggested_action: 'supportticket' } },
  { label: 'Kein Lead', patch: { suggested_action: 'kein_lead' } },
];

const domain = (x) => String(x || '').split('@')[1] || '';

export default function InboxItemCard({ item, offen, onOeffnen, onConvert, onAssign, onSupportTicket, onChanged }) {
  const act = item.suggested_action || (item.track === 'support' ? 'supportticket' : 'anfrage');
  const Icon = SOURCE_ICON[item.source] || PenLine;
  const stark = item.lead_strength === 'stark';
  const tageOffen = Math.floor(
    (Date.now() - new Date(item.received_at || item.created_date).getTime()) / 86400000,
  );
  const ueberfaellig = tageOffen >= 2;
  const [dismissOpen, setDismissOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const einordnung = suggestionMeta(item)?.label;
  const signale = (item.buying_signals || []).map(parseSignal);

  // Zweite Zeile der KI-Spalte — in einem Satz, was die KI erkannt hat
  const zweiteZeile = act === 'supportticket'
    ? (item.request_nature === 'stoerung' ? 'Störung an Bestehendem'
      : item.request_nature === 'aenderung_bestehend' ? 'Änderung an Bestehendem'
      : INQUIRY_TYPE_LABELS[item.inquiry_type] || '')
    : act === 'anfrage' && item.lead_strength
      ? `Lead ${stark ? 'stark' : 'schwach'} · ${item.signal_count || 0} Signale`
      : INQUIRY_TYPE_LABELS[item.inquiry_type] || '';

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

  const korrigiere = async (patch) => {
    await base44.entities.CrmInboxItem.update(item.id, patch);
    onChanged?.();
  };

  const knopf = (ziel) => (act === ziel ? 'default' : 'outline');

  return (
    <div className={cn(ueberfaellig && TON_STREIFEN.critical)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={offen}
        onClick={onOeffnen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOeffnen?.(); } }}
        className={cn('grid grid-cols-[36px_minmax(0,1fr)_200px_150px_16px] gap-3.5 items-center px-4 py-3 cursor-pointer hover:bg-muted/40', offen && 'bg-muted/30')}
      >
        <span className="w-8 h-8 rounded-lg bg-muted grid place-items-center text-foreground/70">
          <Icon className="w-4 h-4" />
        </span>

        <div className="min-w-0">
          <p className="text-object text-foreground truncate">{item.subject || 'Anfrage ohne Betreff'}</p>
          <p className="text-label uppercase text-muted-foreground truncate">
            {[item.sender_name, item.matched_customer_name || domain(item.sender_email), item.sender_phone]
              .filter(Boolean).join(' · ') || 'Unbekannter Absender'}
          </p>
        </div>

        <div className="min-w-0">
          <p className={cn('inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em]', einordnung ? 'text-foreground' : 'text-muted-foreground')}>
            <Sparkles className="w-3.5 h-3.5" />{einordnung || 'Ohne Einordnung'}
          </p>
          {zweiteZeile && (
            <p className="text-meta text-muted-foreground inline-flex items-center gap-1.5">
              {act === 'anfrage' && item.lead_strength && <LeadStaerke stark={stark} />}
              {zweiteZeile}
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="text-meta text-muted-foreground">
            {new Date(item.received_at || item.created_date).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
          {ueberfaellig ? (
            <p className="text-meta font-semibold text-status-critical">{tageOffen} Tage unbeantwortet</p>
          ) : (
            <p className="text-meta text-muted-foreground">{tageOffen === 1 ? 'seit 1 Tag' : 'heute'}</p>
          )}
        </div>

        <ChevronDown className={cn('w-4 h-4 text-muted-foreground', offen && 'rotate-180')} />
      </div>

      {offen && (
        <div className="border-t px-4 pt-4 pb-4 pl-[66px]">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4 items-start">
            <div className="space-y-2 min-w-0">
              <p className="text-label uppercase text-muted-foreground">{HERKUNFT[item.source] || HERKUNFT.manual}</p>
              <InboxItemBody item={item} />
              <p className="text-meta text-muted-foreground">
                An:{' '}
                {item.recipient || (
                  <span title="Die E-Mail-Datenbank speichert kein Empfängerfeld. Belegbar ist der Empfänger nur über eine „An:“-Zeile im Text oder eine eigene Antwort im Verlauf — beides fehlt hier.">
                    nicht hinterlegt
                  </span>
                )}
              </p>
            </div>

            <div className="border rounded-lg bg-card">
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                  <Sparkles className="w-3.5 h-3.5" /> KI-Einschätzung
                </span>
                {item.lead_strength && (
                  <span className="inline-flex items-center gap-1.5 text-meta text-muted-foreground">
                    <LeadStaerke stark={stark} />{stark ? 'Sicherheit hoch' : 'Sicherheit niedrig'}
                  </span>
                )}
              </div>
              <div className="p-3.5 space-y-3">
                <div className="space-y-0.5">
                  <p className="text-label uppercase text-muted-foreground">Vorschlag</p>
                  <p className="text-value">
                    {act === 'supportticket' ? 'Supportticket anlegen'
                      : act === 'kein_lead' ? 'Kein Deal / kein Lead' : 'Deal / Lead anlegen'}
                  </p>
                  <p className="text-meta text-muted-foreground">
                    {item.suggested_pipeline === 'existing_customer' ? 'Pipeline Bestandskunden' : 'Pipeline Neukunden'}
                    {' · '}
                    {item.is_known_customer
                      ? `bekannter Kunde${item.matched_customer_name ? ': ' + item.matched_customer_name : ''}`
                      : 'Absender-Domain unbekannt'}
                  </p>
                  {item.lead_strength === 'schwach' && (
                    <p className="text-meta text-muted-foreground">Unsicher — Alternative: Kein Deal / kein Lead.</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="text-label uppercase text-muted-foreground">Warum · {signale.length} Signale</p>
                  {signale.length === 0 ? (
                    <p className="text-meta text-muted-foreground">Keine Signale erkannt.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {signale.map((s, i) => (
                        <li key={i} className="grid grid-cols-[16px_1fr] gap-2">
                          <Check className="w-3.5 h-3.5 mt-0.5 text-status-done" />
                          <div>
                            <p className="text-meta font-semibold text-foreground">{s.label}</p>
                            {s.evidence && <p className="text-meta text-muted-foreground">„{s.evidence}“</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">Einschätzung korrigieren</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {KORREKTUREN.map((k) => (
                      <DropdownMenuItem key={k.label} onClick={() => korrigiere(k.patch)}>{k.label}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3.5 border-t flex flex-wrap items-center gap-2 -ml-[50px]">
            <Button variant={knopf('anfrage')} disabled={busy} onClick={() => onConvert(item)}>
              {act === 'anfrage' && <UserPlus />} Deal / Lead anlegen
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => onAssign(item)}>
              Zu Deal zuordnen
            </Button>
            <Button variant={knopf('supportticket')} disabled={busy} onClick={() => onSupportTicket?.(item)}>
              {act === 'supportticket' && <LifeBuoy />} Supportticket anlegen
            </Button>
            <Button variant={knopf('kein_lead')} disabled={busy} onClick={() => decide('nur_antwort')}>
              {act === 'kein_lead' && <MailCheck />} Kein Deal / kein Lead
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" disabled={busy} onClick={() => setDismissOpen(true)}>
              <Archive /> Erledigt (mit Grund)
            </Button>
          </div>
        </div>
      )}

      <InboxDismissDialog open={dismissOpen} onOpenChange={setDismissOpen}
        onConfirm={(reason) => decide('verworfen', reason)} />
    </div>
  );
}