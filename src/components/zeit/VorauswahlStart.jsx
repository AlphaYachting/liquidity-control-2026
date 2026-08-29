import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';
import { kuerzelVorschlag } from '@/lib/zeit/useProjektSuche';
import ProjektKopf from './ProjektKopf';
import ZahlenBlock from './ZahlenBlock';
import HauptKnopf from './HauptKnopf';
import FussVerweise from './FussVerweise';
import HerkunftEtikett from './HerkunftEtikett';

// Ruhezustand mit Projektbezug. Der Ort liefert nur den Anfangswert — die Wahl
// der Person gewinnt, bis das Fenster geschlossen wird.
export default function VorauswahlStart({ kontext, ortProjektId, ausOrt, onStart, onSuche, onZurueckZumOrt, onNachtragen }) {
  const [notiz, setNotiz] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: pk } = useProjektKontext(kontext.project_id);

  const { data: dazu } = useQuery({
    queryKey: ['zeitVorauswahl', kontext.project_id, kontext.ticket_id, ortProjektId],
    enabled: !!pk?.project,
    queryFn: async () => {
      const [client, ticket, ortProjekt] = await Promise.all([
        pk.project.client_id ? base44.entities.Client.get(pk.project.client_id).catch(() => null) : null,
        kontext.ticket_id ? base44.entities.Ticket.get(kontext.ticket_id).catch(() => null) : null,
        ortProjektId && ortProjektId !== kontext.project_id
          ? base44.entities.Project.get(ortProjektId).catch(() => null)
          : null,
      ]);
      const ortClient = ortProjekt?.client_id
        ? await base44.entities.Client.get(ortProjekt.client_id).catch(() => null)
        : null;
      return { client, ticket, ortKunde: ortClient?.name || ortProjekt?.title || '' };
    },
  });

  const projekt = pk?.project;
  const kunde = dazu?.client?.name || '';
  const aufgabe = ausOrt && kontext.quelle === 'aufgabe' ? dazu?.ticket?.title : '';

  const starten = async () => {
    if (!projekt) return;
    setBusy(true);
    await onStart(projekt, projekt.kuerzel || kuerzelVorschlag(kunde || projekt.title), notiz, {
      force: true,
      ticketId: kontext.ticket_id || undefined,
    });
    setBusy(false);
  };

  return (
    <div className="px-4 pt-[14px] pb-4">
      <ProjektKopf kunde={kunde} titel={projekt?.title} kategorie={pk?.kategorie} aufgabe={aufgabe}>
        <HerkunftEtikett
          ausOrt={ausOrt}
          ortKunde={dazu?.ortKunde}
          onZurueckZumOrt={ortProjektId && ortProjektId !== kontext.project_id ? onZurueckZumOrt : null}
          onSuche={onSuche}
        />
      </ProjektKopf>

      <ZahlenBlock kontext={pk} />

      <Input
        autoFocus
        className="mt-3"
        placeholder="Notiz zur Buchung"
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); starten(); } }}
      />

      <HauptKnopf
        disabled={busy || !projekt}
        grund="Es fehlt noch das Projekt."
        onClick={starten}
        icon={<Play className="w-4 h-4" />}
      >
        Starten
      </HauptKnopf>

      <FussVerweise rechts={{ text: 'Zeit nachtragen', onClick: onNachtragen }} />
    </div>
  );
}