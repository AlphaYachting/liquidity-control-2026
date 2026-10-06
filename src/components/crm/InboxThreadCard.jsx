import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ChevronDown, ExternalLink, Check, Loader2, Siren, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { TON_STREIFEN } from '@/lib/designTon';
import { emailApi } from '@/components/crm/emails/emailApi';
import { EMAIL_CATEGORIES, deriveCustomerFromEmail } from '@/components/crm/emails/emailConfig';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';
import ThreadActionBar from '@/components/crm/emails/ThreadActionBar';
import { wartezeitText } from '@/components/crm/inboxZeit';
import { KLASSE_LABEL } from '@/lib/crm/posteingang';

// Unbeantwortete Konversation ohne KI-Anfrage-Eintrag (laufende Kundenkommunikation,
// Antwort auf Angebot/Rechnung, Verwaltung). Dieselben Entscheidungen wie im Posteingang.
export default function InboxThreadCard({ eintrag, offen, onOeffnen, onChanged }) {
  const t = eintrag.thread || {};
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const kategorie = EMAIL_CATEGORIES[t.category];
  const kunde = t.customer || deriveCustomerFromEmail(eintrag.absender) || '';
  const zeit = wartezeitText(eintrag);

  const erledigt = async () => {
    setBusy(true);
    try {
      await emailApi('enrich', { thread_id: Number(eintrag.threadId), fields: { status: 'erledigt' } });
      toast({ title: 'Erledigt — kommt bei der nächsten Kundennachricht zurück' });
      onChanged?.();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Nicht gespeichert', description: e?.response?.data?.error || e?.message });
    }
    setBusy(false);
  };

  return (
    <div className={cn(eintrag.eskalation ? TON_STREIFEN.critical : eintrag.ueberfaellig && TON_STREIFEN.attention)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={offen}
        onClick={onOeffnen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOeffnen?.(); } }}
        className={cn('grid grid-cols-[36px_minmax(0,1fr)_200px_150px_16px] gap-3.5 items-center px-4 py-3 cursor-pointer hover:bg-muted/40', offen && 'bg-muted/30')}
      >
        <span className="w-8 h-8 rounded-lg bg-muted grid place-items-center text-foreground/70">
          <Mail className="w-4 h-4" />
        </span>

        <div className="min-w-0">
          <p className="text-object text-foreground truncate">{eintrag.betreff || 'Ohne Betreff'}</p>
          <p className="text-label uppercase text-muted-foreground truncate">
            {[eintrag.absenderName, kunde, `${t.message_count || 1} Nachr.`].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="min-w-0">
          {eintrag.eskalation ? (
            <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.04em] text-status-critical">
              <Siren className="w-3.5 h-3.5" /> Eskalation
            </p>
          ) : (
            <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              {KLASSE_LABEL[eintrag.klasse] || 'Kundenanfrage'}
            </p>
          )}
          {t.anliegen_beleg
            ? <p className="text-meta text-muted-foreground truncate" title={t.anliegen_beleg}>„{t.anliegen_beleg}“</p>
            : kategorie && <p className="text-meta text-muted-foreground truncate">{kategorie.label}</p>}
        </div>

        <div className="text-right">
          <p className="text-meta text-muted-foreground">
            {new Date(eintrag.eingang).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className={cn('text-meta', zeit.ton === 'critical' ? 'font-semibold text-status-critical' : 'text-muted-foreground')}>
            {!eintrag.sichtbar && <Clock className="inline w-3 h-3 mr-1 -mt-0.5" />}{zeit.text}
          </p>
        </div>

        <ChevronDown className={cn('w-4 h-4 text-muted-foreground', offen && 'rotate-180')} />
      </div>

      {offen && (
        <div className="border-t px-4 pt-4 pb-4 pl-[66px] space-y-3">
          {/* Entscheidung zuerst — der Verlauf darunter ist oft lang und wird selten ganz gelesen */}
          <ThreadActionBar
            thread={{ id: Number(eintrag.threadId), subject: eintrag.betreff, customer: t.customer || '' }}
            messages={[{ direction: 'in', from: eintrag.absender, from_name: eintrag.absenderName }]}
            onChanged={onChanged}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" asChild>
              <Link to={`/crm/emails?thread=${eintrag.threadId}`}><ExternalLink /> In der E-Mail-Zentrale antworten</Link>
            </Button>
            <span className="flex-1" />
            <Button variant="ghost" disabled={busy} onClick={erledigt}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />} Erledigt (ohne Antwort)
            </Button>
          </div>
          <p className="text-label uppercase text-muted-foreground pt-1">Verlauf · neueste Nachricht zuerst</p>
          <EscalationThreadPreview threadId={eintrag.threadId} start={3} />
        </div>
      )}
    </div>
  );
}
