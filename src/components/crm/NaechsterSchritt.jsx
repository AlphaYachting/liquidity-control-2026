import React from 'react';
import { Target, Mail, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Box } from '@/components/shared/Box';
import StatusEtikett from '@/components/shared/StatusEtikett';
import { kiVorschlag } from '@/lib/crm/kiVorschlag';

const datum = (d) => new Date(d).toLocaleDateString('de-AT');

// Der einzige gefüllte Knopf der Seite — was als Nächstes zu tun ist.
export default function NaechsterSchritt({ deal, activities = [], appointments = [], onAktion, onBearbeiten }) {
  const v = kiVorschlag(deal, activities, appointments);
  const titel = deal.next_step || v.titel;
  const faellig = deal.next_step_date;
  const heute = new Date().toISOString().slice(0, 10);
  const ueberfaelligTage = faellig && faellig < heute
    ? Math.floor((new Date(heute) - new Date(faellig)) / 86400000)
    : 0;

  return (
    <Box streifen="primary">
      <div className="flex flex-wrap items-center gap-3.5 px-4 py-3.5 pl-[19px]">
        <Target className="w-5 h-5 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-[220px]">
          <p className="text-label uppercase text-muted-foreground">
            Nächster Schritt{faellig ? ` · fällig ${datum(faellig)}` : ''}
          </p>
          <p className="text-value">{titel}</p>
          <p className="text-meta text-muted-foreground">{v.grund}</p>
          {ueberfaelligTage > 0 && (
            <div className="mt-1.5">
              <StatusEtikett ton="critical">überfällig seit {ueberfaelligTage} Tagen</StatusEtikett>
            </div>
          )}
        </div>
        <Button onClick={() => onAktion?.(v.intent)}><Mail /> {v.button}</Button>
        <Button variant="outline" size="icon" onClick={onBearbeiten} title="Schritt ändern"><Pencil /></Button>
      </div>
    </Box>
  );
}