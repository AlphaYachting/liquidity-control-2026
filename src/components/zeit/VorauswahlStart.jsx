import React, { useState } from 'react';
import { Play } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { useProjektKontext } from '@/lib/sprint/useProjektKontext';
import { kuerzelVorschlag } from '@/lib/zeit/useProjektSuche';
import ProjektKopf from './ProjektKopf';
import ZahlenBlock from './ZahlenBlock';

// Ruhezustand mit Projektbezug: keine Suche, sondern die Seite, auf der man steht.
export default function VorauswahlStart({ kontext, onStart, onSuche, onNachtragen }) {
  const [notiz, setNotiz] = useState('');
  const [busy, setBusy] = useState(false);
  const { data: pk } = useProjektKontext(kontext.project_id);

  const { data: dazu } = useQuery({
    queryKey: ['zeitVorauswahl', kontext.project_id, kontext.ticket_id],
    enabled: !!pk?.project,
    queryFn: async () => {
      const [client, ticket] = await Promise.all([
        pk.project.client_id ? base44.entities.Client.get(pk.project.client_id).catch(() => null) : null,
        kontext.ticket_id ? base44.entities.Ticket.get(kontext.ticket_id).catch(() => null) : null,
      ]);
      return { client, ticket };
    },
  });

  const projekt = pk?.project;
  const kunde = dazu?.client?.name || '';
  const aufgabe = kontext.quelle === 'aufgabe' ? dazu?.ticket?.title : '';

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
    <div className="p-[14px]">
      <ProjektKopf kunde={kunde} titel={projekt?.title} kategorie={pk?.kategorie} aufgabe={aufgabe} />

      <ZahlenBlock kontext={pk} />

      <Input
        autoFocus
        className="mt-3"
        placeholder="Notiz zur Buchung"
        value={notiz}
        onChange={(e) => setNotiz(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); starten(); } }}
      />

      <button
        type="button"
        disabled={busy || !projekt}
        onClick={starten}
        className="mt-3 w-full h-11 rounded flex items-center justify-center gap-2 text-white text-sm font-bold uppercase tracking-wide disabled:opacity-60"
        style={{ backgroundColor: RITTLER.pink }}
      >
        <Play className="w-4 h-4" /> Starten
      </button>

      <div className="flex items-center gap-4 mt-4">
        <button type="button" onClick={onSuche} className="text-xs underline" style={{ color: RITTLER.textSecondary }}>
          anderes Projekt …
        </button>
        <button type="button" onClick={onNachtragen} className="text-xs underline" style={{ color: RITTLER.textSecondary }}>
          Zeit nachtragen
        </button>
      </div>
    </div>
  );
}