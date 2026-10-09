import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, Coffee, Play, RotateCw } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { useAnwesenheit, uhrzeit, dauer } from '@/lib/arbeitszeit/useAnwesenheit';

// Kommen · Pause · Gehen — rechts neben der Kopfsuche, auf jeder Seite.
// Zeigt immer den Zustand und nur den nächsten möglichen Schritt. Unsichtbar für alle,
// für die die neue Arbeitszeiterfassung (noch) nicht gilt.

const knopfStil = {
  height: 38, borderRadius: 3, border: `1px solid ${RITTLER.line}`, color: RITTLER.black, backgroundColor: RITTLER.white,
};

// Kein Ausgrauen während des Sendens: Die Anzeige springt sofort um; ein zweiter Klick,
// solange der erste noch unterwegs ist, wird nur ignoriert.
function Knopf({ onClick, disabled, icon, children, kurz, betont, title }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-disabled={disabled || undefined}
      title={title}
      className="shrink-0 flex items-center gap-1.5 px-3 text-[13px] font-semibold hover:bg-muted transition-colors"
      style={{ ...knopfStil, ...(betont ? { borderColor: RITTLER.black } : {}) }}
    >
      {icon}
      <span className={kurz ? 'hidden sm:inline' : ''}>{children}</span>
    </button>
  );
}

const Punkt = ({ farbe }) => <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: farbe }} />;

const MELDUNG = {
  veraltet: 'Der Stand hat sich inzwischen geändert (anderes Fenster oder Automatik). Angezeigt wird jetzt der aktuelle Stand.',
  nicht_moeglich: 'Das geht im aktuellen Zustand nicht. Angezeigt wird jetzt der aktuelle Stand.',
};

export default function AnwesenheitsKnopf() {
  const { user } = useAuth();
  const { sichtbar, stand, laeuft, fehlgeschlagen, stempeln, erneut, jetzt } = useAnwesenheit(user?.email);
  const { toast } = useToast();
  const [gehenOffen, setGehenOffen] = useState(false);
  const [notiz, setNotiz] = useState('');
  const [, setTakt] = useState(0);

  // Anzeige der laufenden Arbeitszeit — alle 30 s, nur während jemand da ist
  const zustand = stand?.zustand;
  useEffect(() => {
    if (zustand !== 'da' && zustand !== 'pause') return undefined;
    const i = setInterval(() => setTakt((t) => t + 1), 30 * 1000);
    return () => clearInterval(i);
  }, [zustand]);

  if (!sichtbar) return null;

  const h = stand.heute || {};
  const seitStand = Math.max(0, Math.floor((jetzt().getTime() - Date.parse(stand.jetzt)) / 60000));
  const arbeitszeit = (h.arbeitszeitMin || 0) + (zustand === 'da' ? seitStand : 0);

  const ausfuehren = async (art, extra = {}) => {
    const r = await stempeln(art, extra);
    if (r?.fehler === 'netz') return;
    if (r?.fehler) {
      toast({ description: MELDUNG[r.fehler] || `Nicht gespeichert: ${r.fehler}` });
      return;
    }
    if (r?.gebucht) {
      toast({ description: `Timer gestoppt: ${dauer(r.gebucht.minuten)} auf ${r.gebucht.projekt_titel || 'Projekt'} gebucht.` });
    }
  };

  const gehenBestaetigen = async () => {
    setGehenOffen(false);
    await ausfuehren('gehen', { notiz });
    setNotiz('');
  };

  let anzeige = null;
  let knoepfe = null;
  const beschaeftigt = !!laeuft;

  if (zustand === 'da') {
    anzeige = (
      <span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap" style={{ color: STATUS_COLORS.doneText }}
        title={`Gekommen ${uhrzeit(h.kommen)} · Arbeitszeit ${dauer(arbeitszeit)} · davon auf Projekten ${dauer(h.projektzeitMin)}`}>
        <Punkt farbe={STATUS_COLORS.done} />
        <span className="hidden md:inline">da seit {uhrzeit(h.kommen)} · </span>{dauer(arbeitszeit)}
      </span>
    );
    knoepfe = (
      <>
        <Knopf kurz disabled={beschaeftigt} onClick={() => ausfuehren('pause_start')} icon={<Coffee className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />}
          title={stand.timer ? `Pause — der Timer auf ${stand.timer.projekt_titel} stoppt mit` : 'Pause beginnen'}>
          Pause
        </Knopf>
        <Knopf kurz disabled={beschaeftigt} onClick={() => setGehenOffen(true)} icon={<LogOut className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />} title="Gehen">
          Gehen
        </Knopf>
      </>
    );
  } else if (zustand === 'pause') {
    anzeige = (
      <span className="flex items-center gap-1.5 text-[13px] whitespace-nowrap" style={{ color: STATUS_COLORS.attention }}>
        <Punkt farbe={STATUS_COLORS.attention} />
        <span className="hidden md:inline">Pause seit </span>{uhrzeit(stand.seit)}
      </span>
    );
    knoepfe = (
      <Knopf betont disabled={beschaeftigt} onClick={() => ausfuehren('pause_ende')} icon={<Play className="w-4 h-4" />}>
        Pause beenden
      </Knopf>
    );
  } else {
    const warSchonDa = (h.bloecke || []).length > 0;
    anzeige = warSchonDa ? (
      <span className="hidden md:inline text-[13px] whitespace-nowrap" style={{ color: RITTLER.textSecondary }}>heute {dauer(h.arbeitszeitMin)}</span>
    ) : null;
    knoepfe = (
      <Knopf betont={!warSchonDa} disabled={beschaeftigt} onClick={() => ausfuehren('kommen')} icon={<LogIn className="w-4 h-4" />}>
        Kommen
      </Knopf>
    );
  }

  return (
    <>
      <div className="shrink-0 flex items-center gap-2">
        {stand.gehenUnklar && zustand === 'weg' && (
          <span className="hidden md:inline text-[12px] font-semibold whitespace-nowrap" style={{ color: STATUS_COLORS.attention }}
            title="Gehen wurde nicht gestempelt und automatisch beendet. Die Arbeitszeit dieses Blocks zählt erst, wenn das Gehen angegeben und genehmigt ist.">
            Gehen offen
          </span>
        )}
        {stand.zuKlaeren > 0 && (
          <span className="text-[12px] font-semibold whitespace-nowrap px-1.5 py-0.5 rounded-[2px]"
            style={{ color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }}
            title="Automatisch beendete Zeiten, zu denen noch eine Angabe fehlt">
            {stand.zuKlaeren} zu klären
          </span>
        )}
        {anzeige}
        {fehlgeschlagen ? (
          <Knopf betont onClick={erneut} icon={<RotateCw className="w-4 h-4" />} title="Keine Verbindung — derselbe Knopfdruck wird erneut gesendet, nichts doppelt">
            Erneut senden
          </Knopf>
        ) : knoepfe}
      </div>

      <Dialog open={gehenOffen} onOpenChange={setGehenOffen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="uppercase font-bold">Gehen</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p style={{ color: RITTLER.textSecondary }}>
              Heute {dauer(arbeitszeit)} Arbeitszeit seit {uhrzeit(h.kommen)}, davon {dauer(h.projektzeitMin)} auf Projekten.
            </p>
            {stand.timer && (
              <div className="space-y-1.5">
                <p>Der Timer auf <b>{stand.timer.projekt_titel || 'Projekt'}</b> wird gestoppt und gebucht.</p>
                <Input autoFocus placeholder="Was wurde gemacht? (Beschreibung zur Buchung)" value={notiz} onChange={(e) => setNotiz(e.target.value)} />
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setGehenOffen(false)} className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide"
                style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
                Abbrechen
              </button>
              <button type="button" onClick={gehenBestaetigen} className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide"
                style={{ borderColor: RITTLER.black, color: RITTLER.black }}>
                Jetzt gehen
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
