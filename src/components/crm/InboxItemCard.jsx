import React, { useState } from 'react';
import { Phone, Mail, PenLine, UserPlus, MailCheck, LifeBuoy, Check, Archive, Siren, Link2, ExternalLink } from 'lucide-react';
import { wartezeitText } from '@/components/crm/inboxZeit';
import { KLASSE_LABEL } from '@/lib/crm/posteingang';
import ZuweisungWahl, { ZustaendigHinweis } from '@/components/crm/ZuweisungWahl';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/components/ui/use-toast';
import InboxItemBody from '@/components/crm/InboxItemBody';
import InboxDismissDialog from '@/components/crm/InboxDismissDialog';
import InboxCaptureDialog from '@/components/crm/InboxCaptureDialog';
import LeadStaerke from '@/components/crm/LeadStaerke';
import { decideInboxItem, eintragAendern, threadIdOf } from '@/components/crm/inboxDecision';
import { INQUIRY_TYPE_LABELS, parseSignal } from '@/components/crm/inboxSignals';
import { suggestionMeta } from '@/components/crm/InboxSuggestionLabel';
import { alsDatum } from '@/lib/zeitpunkt';
import { PostZeile, PostAktionen, PostAbschnitt, postDatum } from '@/components/post/PostBaukasten';

const SOURCE_ICON = { phone_ai: Phone, email: Mail, manual: PenLine };
const HERKUNFT = { email: 'Nachricht', phone_ai: 'Gesprächsnotiz · Telefon-KI', manual: 'Manuell erfasst' };
const KORREKTUREN = [
  { label: 'Neue Anfrage', patch: { suggested_action: 'anfrage', is_known_customer: false } },
  { label: 'Bestandskunde-Anfrage', patch: { suggested_action: 'anfrage', is_known_customer: true } },
  { label: 'Supportticket', patch: { suggested_action: 'supportticket' } },
  { label: 'Kein Lead', patch: { suggested_action: 'kein_lead' } },
];

const domain = (x) => String(x || '').split('@')[1] || '';

// Anfrage im Posteingang (E-Mail mit KI-Einordnung, Telefon-KI, manuell) — aufgebaut aus dem
// Post-Baukasten: Zeile · eine Aktionsleiste · Nachricht · KI-Einschätzung (zugeklappt).
export default function InboxItemCard({ item, eintrag, offen, onOeffnen, onConvert, onAssign, onSupportTicket, onChanged }) {
  const act = item.suggested_action || (item.track === 'support' ? 'supportticket' : 'anfrage');
  const Icon = SOURCE_ICON[item.source] || PenLine;
  const stark = item.lead_strength === 'stark';
  // Im Posteingang zählt die jüngste Kundennachricht der Konversation, nicht die erste Anfrage
  const eingang = eintrag?.eingang || alsDatum(item.received_at || item.created_date).getTime();
  const tageOffen = Math.floor((Date.now() - eingang) / 86400000);
  const zeit = eintrag ? wartezeitText(eintrag) : { text: tageOffen >= 2 ? `${tageOffen} Tage unbeantwortet` : tageOffen === 1 ? 'seit 1 Tag' : 'heute', ton: tageOffen >= 2 ? 'critical' : 'neutral' };
  const [dismissOpen, setDismissOpen] = useState(false);
  const [bearbeitenOffen, setBearbeitenOffen] = useState(false);
  const manuell = item.source === 'manual';
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const threadId = threadIdOf(item);

  // Im Posteingang gilt die Einordnung der letzten Kundennachricht (Arbeitsbereich)
  const klasse = eintrag?.klasse;
  const einordnung = eintrag?.eskalation ? 'Eskalation' : ((klasse && KLASSE_LABEL[klasse]) || suggestionMeta(item)?.label || 'Ohne Einordnung');
  const signale = (item.buying_signals || []).map(parseSignal);

  // Zweite Zeile der Einordnung — in einem Satz, was die KI erkannt hat
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
    try {
      await eintragAendern(item.id, patch);
      onChanged?.();
    } catch (e) {
      toast({ variant: 'destructive', title: 'Korrektur nicht gespeichert', description: e?.message });
    }
  };

  // Empfohlen (gefüllt) ist, was Einordnung bzw. KI vorschlagen — Reihenfolge bleibt überall gleich
  const empfohlen = klasse === 'support' || act === 'supportticket' ? 'support'
    : act === 'anfrage' ? 'lead' : 'antworten';

  return (
    <>
      <PostZeile
        symbol={eintrag?.eskalation ? <Siren className="w-4 h-4 text-status-critical" /> : <Icon className="w-4 h-4" />}
        ton={eintrag?.eskalation ? 'critical' : (eintrag?.ueberfaellig || tageOffen >= 2) ? 'attention' : null}
        titel={item.subject || 'Anfrage ohne Betreff'}
        unterzeile={[item.sender_name, item.matched_customer_name || domain(item.sender_email), item.sender_phone]
          .filter(Boolean).join(' · ') || 'Unbekannter Absender'}
        einordnung={einordnung}
        einordnungTon={eintrag?.eskalation ? 'critical' : null}
        einordnungZeile2={zweiteZeile}
        datum={postDatum(eingang)}
        stand={zeit.text}
        standTon={zeit.ton}
        standWartet={eintrag && !eintrag.sichtbar}
        zustaendig={eintrag ? <ZustaendigHinweis eintrag={eintrag} /> : null}
        offen={offen}
        onOeffnen={onOeffnen}
      >
        <PostAktionen
          busy={busy}
          aktionen={[
            threadId && { key: 'antworten', label: 'Antworten', icon: ExternalLink, href: `/crm/emails?thread=${threadId}`, primaer: empfohlen === 'antworten' },
            { key: 'support', label: 'Support-Ticket', icon: LifeBuoy, onClick: () => onSupportTicket?.(item), primaer: empfohlen === 'support' },
            { key: 'lead', label: 'Anfrage / Lead', icon: UserPlus, onClick: () => onConvert(item), primaer: empfohlen === 'lead' },
          ]}
          mehr={[
            { key: 'deal', label: 'Bestehendem Deal zuordnen', icon: Link2, onClick: () => onAssign(item) },
            { key: 'keinlead', label: 'Kein Lead — bleibt bis zur Antwort im Posteingang', icon: MailCheck, onClick: () => decide('nur_antwort') },
            manuell && { key: 'bearbeiten', label: 'Erfassung bearbeiten', icon: PenLine, onClick: () => setBearbeitenOffen(true) },
            { key: 'erledigt', label: 'Erledigt (mit Grund)', icon: Archive, onClick: () => setDismissOpen(true), trenner: true },
          ]}
          rechts={eintrag ? <ZuweisungWahl eintrag={eintrag} onChanged={onChanged} /> : null}
        />

        <PostAbschnitt titel={threadId ? 'Verlauf' : (HERKUNFT[item.source] || HERKUNFT.manual)} zusatz={threadId ? 'neueste Nachricht zuerst' : (item.recipient ? `an ${item.recipient}` : '')}>
          <InboxItemBody item={item} />
        </PostAbschnitt>

        <PostAbschnitt
          titel="KI-Einschätzung"
          zusatz={[
            act === 'supportticket' ? 'Vorschlag Support-Ticket' : act === 'kein_lead' ? 'Vorschlag kein Lead' : 'Vorschlag Anfrage / Lead',
            item.lead_strength ? (stark ? 'Sicherheit hoch' : 'Sicherheit niedrig') : '',
            `${signale.length} Signale`,
          ].filter(Boolean).join(' · ')}
          klappbar
          startOffen={false}
        >
          <div className="rounded-lg border bg-card p-3.5 space-y-3">
            <p className="text-meta text-muted-foreground">
              {item.suggested_pipeline === 'existing_customer' ? 'Pipeline Bestandskunden' : 'Pipeline Neukunden'}
              {' · '}
              {item.is_known_customer
                ? `bekannter Kunde${item.matched_customer_name ? ': ' + item.matched_customer_name : ''}`
                : 'Absender-Domain unbekannt'}
              {item.lead_strength && <span className="inline-flex items-center gap-1.5 ml-2"><LeadStaerke stark={stark} /></span>}
            </p>
            {signale.length > 0 && (
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
        </PostAbschnitt>
      </PostZeile>

      <InboxDismissDialog open={dismissOpen} onOpenChange={setDismissOpen}
        onConfirm={(reason) => decide('verworfen', reason)} />
      {manuell && (
        <InboxCaptureDialog open={bearbeitenOffen} onOpenChange={setBearbeitenOffen}
          item={item} onSaved={() => onChanged?.()} />
      )}
    </>
  );
}
