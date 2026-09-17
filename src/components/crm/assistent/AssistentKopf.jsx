import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronRight, Sparkles } from 'lucide-react';
import { dateLabel } from './assistentConfig';

// Eine Zeile im Ruhezustand: Pfeil, Titel, Lage, vorgeschlagene Handlung.
export default function AssistentKopf({ offen, onToggle, stand, letzteGesendet, kontaktName, vorschlag, onVorschlag }) {
  const lage = offen ? (
    <>E-Mail an {kontaktName || 'den Kontakt'} entwerfen</>
  ) : stand ? (
    <>
      Angebot vom {dateLabel(stand.gesendet_am)} · <b className="font-semibold">seit {stand.tage} Tagen keine Rückmeldung</b>
    </>
  ) : letzteGesendet ? (
    <>zuletzt gesendet am {dateLabel(letzteGesendet.activity_date)}</>
  ) : (
    <>noch nichts gesendet</>
  );

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <button type="button" onClick={onToggle} className="flex items-center gap-3 min-w-0 flex-1 text-left">
        <ChevronRight
          className={`w-[14px] h-[14px] text-muted-foreground shrink-0 transition-transform ${offen ? 'rotate-90' : ''}`}
        />
        <Sparkles className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-value flex-none">KI-Assistent</span>
        <span className="text-meta text-muted-foreground truncate">· {lage}</span>
      </button>
      {offen ? (
        <Button size="sm" variant="ghost" className="ml-auto" onClick={onToggle}>Schließen</Button>
      ) : (
        <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={onVorschlag}>
          {vorschlag.label}
        </Button>
      )}
    </div>
  );
}