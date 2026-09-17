import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Box, BoxKopf } from '@/components/shared/Box';
import Abschnittstitel from '@/components/shared/Abschnittstitel';
import Listenzeile from '@/components/shared/Listenzeile';
import TypPill from '@/components/sprint/TypPill';
import { schweregradZuTon } from '@/lib/designTon';

const ERST = 5;

// Eine Handlungsliste der Projekt-Intelligence in der Zeilenform der Projekte-Übersicht.
export default function IntelligenzListe({ id, title, hint, rows = [], onOpen, zeile, ton, eingebettet }) {
  const [alle, setAlle] = useState(false);
  const sichtbar = alle ? rows : rows.slice(0, ERST);

  const zeilen = (
    <div className="divide-y">
      {sichtbar.map((r) => (
        <Listenzeile
          key={r.project_id}
          typ={r.projekt_typ ? <TypPill project={r.projekt_typ} /> : <span />}
          titel={r.customer || '—'}
          {...zeile(r)}
          wertTon={ton || schweregradZuTon(r.schweregrad)}
          aktion={<Button variant="outline" size="sm" onClick={() => onOpen(r)}>Öffnen</Button>}
        />
      ))}
      {!alle && rows.length > ERST && (
        <div className="px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => setAlle(true)}>
            {rows.length - ERST} weitere anzeigen
          </Button>
        </div>
      )}
    </div>
  );

  if (eingebettet) {
    if (!rows.length) return null;
    return (
      <div className="space-y-2">
        <Abschnittstitel>{title}</Abschnittstitel>
        <div className="border rounded-lg">{zeilen}</div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div id={id}>
        <Box>
          <BoxKopf symbol={CheckDone} titel={title} hinweis="nichts offen" offen={false} />
        </Box>
      </div>
    );
  }

  return (
    <div id={id}>
      <Box>
        <BoxKopf titel={title} zaehler={rows.length} hinweis={hint} />
        {zeilen}
      </Box>
    </div>
  );
}

// Häkchen im Ton „erledigt" — der einzige farbige Punkt einer leeren Liste.
function CheckDone(props) {
  return <Check {...props} className="w-4 h-4 text-status-done shrink-0" />;
}