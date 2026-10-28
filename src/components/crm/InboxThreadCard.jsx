import React from 'react';
import { Mail, Siren } from 'lucide-react';
import { EMAIL_CATEGORIES, deriveCustomerFromEmail } from '@/components/crm/emails/emailConfig';
import EscalationThreadPreview from '@/components/crm/emails/EscalationThreadPreview';
import { useThreadAktionen } from '@/components/crm/emails/ThreadActionBar';
import { wartezeitText } from '@/components/crm/inboxZeit';
import { KLASSE_LABEL } from '@/lib/crm/posteingang';
import ZuweisungWahl, { ZustaendigHinweis } from '@/components/crm/ZuweisungWahl';
import { PostZeile, PostAktionen, PostAbschnitt, postDatum } from '@/components/post/PostBaukasten';

// Unbeantwortete Konversation im Posteingang — aufgebaut aus dem Post-Baukasten (gleiche Optik
// wie Eskalationen, „Meine Post“ und E-Mail-Zentrale): Zeile · eine Aktionsleiste · Verlauf.
export default function InboxThreadCard({ eintrag, offen, onOeffnen, onChanged }) {
  const t = eintrag.thread || {};
  const kategorie = EMAIL_CATEGORIES[t.category];
  const kunde = t.customer || deriveCustomerFromEmail(eintrag.absender) || '';
  const zeit = wartezeitText(eintrag);
  const anliegenNachKlasse = { support: 'supportticket', neu: 'anfrage' };

  const { aktionen, mehr, dialoge, busy } = useThreadAktionen({
    thread: {
      id: Number(eintrag.threadId),
      subject: eintrag.betreff,
      customer: t.customer || '',
      // Die Einordnung im Posteingang bestimmt, welche Aktion empfohlen (gefüllt) ist
      suggested_action: anliegenNachKlasse[eintrag.klasse] || '',
      eskalation: eintrag.eskalation,
    },
    messages: [{ direction: 'in', from: eintrag.absender, from_name: eintrag.absenderName }],
    onChanged,
  });

  return (
    <PostZeile
      symbol={eintrag.eskalation ? <Siren className="w-4 h-4 text-status-critical" /> : <Mail className="w-4 h-4" />}
      ton={eintrag.eskalation ? 'critical' : eintrag.ueberfaellig ? 'attention' : null}
      titel={eintrag.betreff}
      unterzeile={eintrag.intern
        ? [`intern von ${eintrag.absenderName || eintrag.absender}`, kunde !== deriveCustomerFromEmail(eintrag.absender) ? kunde : '', `${t.message_count || 1} Nachr.`].filter(Boolean).join(' · ')
        : [eintrag.absenderName, kunde, `${t.message_count || 1} Nachr.`].filter(Boolean).join(' · ')}
      einordnung={eintrag.eskalation ? 'Eskalation' : eintrag.intern ? 'Support · intern weitergeleitet' : (KLASSE_LABEL[eintrag.klasse] || 'Kundenanfrage')}
      einordnungTon={eintrag.eskalation ? 'critical' : null}
      einordnungZeile2={t.anliegen_beleg ? `„${t.anliegen_beleg}“` : kategorie?.label}
      datum={postDatum(eintrag.eingang)}
      stand={zeit.text}
      standTon={zeit.ton}
      standWartet={!eintrag.sichtbar}
      zustaendig={<ZustaendigHinweis eintrag={eintrag} />}
      offen={offen}
      onOeffnen={onOeffnen}
    >
      <PostAktionen
        busy={busy}
        aktionen={[aktionen.antworten, aktionen.support, aktionen.lead]}
        mehr={[mehr.deal, mehr.erledigt]}
        rechts={<ZuweisungWahl eintrag={eintrag} onChanged={onChanged} />}
      />
      <PostAbschnitt titel="Verlauf" zusatz="neueste Nachricht zuerst">
        <EscalationThreadPreview threadId={eintrag.threadId} start={3} />
      </PostAbschnitt>
      {dialoge}
    </PostZeile>
  );
}
