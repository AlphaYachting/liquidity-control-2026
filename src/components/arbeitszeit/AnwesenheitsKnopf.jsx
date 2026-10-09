import React, { useEffect, useState } from 'react';
import { LogIn, LogOut, Coffee, Play, RotateCw } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { useAnwesenheit, uhrzeit, dauer } from '@/lib/arbeitszeit/useAnwesenheit';

// Kommen · Pause · Gehen — ganz rechts in der Kopfleiste, auf jeder Seite.
// EIN geschlossener Block (gleicher Rahmen wie Suche und Rückmeldung): links der Zustand mit
// Uhrzeit, rechts davon nur die Schritte, die jetzt möglich sind — durch feine Linien getrennt.
// Unsichtbar für alle, für die die neue Arbeitszeiterfassung (noch) nicht gilt.

const HOEHE = 38;

// Ein Segment im Block. Kein Ausgrauen während des Sendens: Die Anzeige springt sofort um;
// ein zweiter Klick, solange der erste noch unterwegs ist, wird nur ignoriert.
function Segment({ onClick, gesperrt, icon, children, kurz, stark, title }) {
  return (
    <button
      type="button"
      onClick={gesperrt ? undefined : onClick}
      aria-disabled={gesperrt || undefined}
      title={title}
      className="h-full flex items-center gap-1.5 px-3 text-[13px] font-semibold hover:bg-muted transition-colors border-l first:border-l-0"
      style={{ borderColor: RITTLER.line, color: RITTLER.black, ...(stark ? { fontWeight: 700 } : {}) }}
    >
      {icon}
      <span className={kurz ? 'hidden sm:inline' : ''}>{children}</span>
    </button>
  );
}

const Punkt = ({ farbe }) => <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: farbe }} />;
const icon = (Icon) => <Icon className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />;

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
  const gesperrt = !!laeuft;

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

  // Linkes Feld: der Zustand (nicht anklickbar — Statusfarben nie auf Knöpfen)
  let status = null;
  let schritte = null;
  const warSchonDa = (h.bloecke || []).length > 0;

  if (zustand === 'da') {
    status = {
      farbe: STATUS_COLORS.done,
      text: STATUS_COLORS.doneText,
      lang: `seit ${uhrzeit(h.kommen)} · ${dauer(arbeitszeit)}`,
      kurz: dauer(arbeitszeit),
      title: `Gekommen ${uhrzeit(h.kommen)} · Arbeitszeit ${dauer(arbeitszeit)} · davon auf Projekten ${dauer(h.projektzeitMin)}`,
    };
    schritte = (
      <>
        <Segment kurz gesperrt={gesperrt} onClick={() => ausfuehren('pause_start')} icon={icon(Coffee)}
          title={stand.timer ? `Pause — der Timer auf ${stand.timer.projekt_titel} stoppt mit` : 'Pause beginnen'}>
          Pause
        </Segment>
        <Segment kurz gesperrt={gesperrt} onClick={() => setGehenOffen(true)} icon={icon(LogOut)} title="Gehen">
          Gehen
        </Segment>
      </>
    );
  } else if (zustand === 'pause') {
    status = {
      farbe: STATUS_COLORS.attention,
      text: STATUS_COLORS.attention,
      lang: `Pause seit ${uhrzeit(stand.seit)}`,
      kurz: uhrzeit(stand.seit),
      title: `Pause seit ${uhrzeit(stand.seit)} · Arbeitszeit bisher ${dauer(arbeitszeit)}`,
    };
    schritte = (
      <Segment stark gesperrt={gesperrt} onClick={() => ausfuehren('pause_ende')} icon={<Play className="w-4 h-4" />}>
        Pause beenden
      </Segment>
    );
  } else {
    status = warSchonDa ? {
      farbe: RITTLER.line,
      text: RITTLER.textSecondary,
      lang: `heute ${dauer(h.arbeitszeitMin)}`,
      kurz: dauer(h.arbeitszeitMin),
      title: `Heute bisher ${dauer(h.arbeitszeitMin)} Arbeitszeit, davon ${dauer(h.projektzeitMin)} auf Projekten`,
    } : null;
    schritte = (
      <Segment stark={!warSchonDa} gesperrt={gesperrt} onClick={() => ausfuehren('kommen')} icon={<LogIn className="w-4 h-4" />}>
        Kommen
      </Segment>
    );
  }

  const hinweis = stand.zuKlaeren > 0
    ? { text: `${stand.zuKlaeren} zu klären`, title: 'Automatisch beendete Zeiten, zu denen noch eine Angabe fehlt' }
    : stand.gehenUnklar && zustand === 'weg'
      ? { text: 'Gehen offen', title: 'Gehen wurde nicht gestempelt und automatisch beendet. Die Arbeitszeit dieses Blocks zählt erst, wenn das Gehen angegeben und genehmigt ist.' }
      : null;

  return (
    <>
      <div
        className="shrink-0 flex items-stretch overflow-hidden sm:ml-2"
        style={{ height: HOEHE, borderRadius: 3, border: `1px solid ${RITTLER.line}`, backgroundColor: RITTLER.white }}
        role="group"
        aria-label="Arbeitszeit"
      >
        {status && (
          <div className="flex items-center gap-1.5 px-3 text-[13px] font-semibold tabular-nums whitespace-nowrap"
            style={{ color: status.text, backgroundColor: RITTLER.surface }} title={status.title}>
            <Punkt farbe={status.farbe} />
            <span className="hidden md:inline">{status.lang}</span>
            <span className="md:hidden">{status.kurz}</span>
            {hinweis && (
              <span className="ml-1 text-[11px] font-bold px-1.5 py-0.5 rounded-[2px]"
                style={{ color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }} title={hinweis.title}>
                {hinweis.text}
              </span>
            )}
          </div>
        )}
        {!status && hinweis && (
          <div className="flex items-center px-2" title={hinweis.title}>
            <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-[2px]"
              style={{ color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }}>
              {hinweis.text}
            </span>
          </div>
        )}
        <div className="flex items-stretch border-l first:border-l-0" style={{ borderColor: RITTLER.line }}>
          {fehlgeschlagen ? (
            <Segment stark onClick={erneut} icon={<RotateCw className="w-4 h-4" />}
              title="Keine Verbindung — derselbe Knopfdruck wird erneut gesendet, nichts doppelt">
              Erneut senden
            </Segment>
          ) : schritte}
        </div>
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
