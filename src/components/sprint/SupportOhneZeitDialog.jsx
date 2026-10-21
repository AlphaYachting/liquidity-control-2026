import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { todayIso } from '@/components/sprint/sprintConfig';
import { bucheZeit } from '@/lib/sprint/useTimer';
import { findeLuecke } from '@/lib/zeit/luecke';
import { tagesbeginnMinute } from '@/lib/zeit/arbeitstag';
import { OHNE_ZEIT_GRUENDE } from '@/lib/sprint/supportErledigt';

const SCHNELL = [15, 30, 45, 60, 90];

// Ein Support-Ticket ohne gebuchte Zeit wird erledigt (21.10.2026): entweder die Zeit jetzt
// nachtragen (Dauer + Beschreibung Pflicht) oder ohne Zeit abschließen — dann mit Grund.
// Über die Verrechnung entscheidet danach die Führung in der Support-Abrechnung.
// offen = { ticket, project } | null
export default function SupportOhneZeitDialog({ offen, onCancel, onConfirm }) {
  const { user } = useAuth();
  const [modus, setModus] = useState('zeit');
  const [minuten, setMinuten] = useState('');
  const [notiz, setNotiz] = useState('');
  const [grund, setGrund] = useState('');
  const [grundNotiz, setGrundNotiz] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    if (!offen) return;
    setModus('zeit'); setMinuten(''); setNotiz(''); setGrund(''); setGrundNotiz(''); setLaeuft(false); setFehler('');
  }, [offen]);

  const ticket = offen?.ticket;
  const min = Math.round(Number(String(minuten).replace(',', '.')) || 0);
  const bereit = modus === 'zeit'
    ? min > 0 && !!notiz.trim()
    : !!grund && (grund !== 'sonstiges' || !!grundNotiz.trim());

  const absenden = async (e) => {
    e?.preventDefault();
    if (!bereit || !ticket) return;
    setLaeuft(true);
    setFehler('');
    try {
      if (modus === 'zeit') {
        const tag = todayIso();
        const [heute, beginn] = await Promise.all([
          base44.entities.TimeEntry.filter({ person_email: user.email, entry_date: tag }, '-started_at', 50),
          tagesbeginnMinute(user.email, tag).catch(() => null),
        ]);
        const zeiten = findeLuecke(tag, heute, min, beginn);
        const buchung = {
          projectId: ticket.project_id,
          email: user.email,
          durationMinutes: min,
          entryDate: tag,
          startedAt: zeiten.started_at,
          endedAt: zeiten.ended_at,
          note: notiz.trim(),
          ticketId: ticket.id,
          quelle: 'luecke',
        };
        try {
          await bucheZeit(buchung);
        } catch (err) {
          if (err?.bestaetigen && window.confirm(err.message)) await bucheZeit({ ...buchung, trotzdem: true });
          else throw err;
        }
      } else {
        await base44.entities.Ticket.update(ticket.id, {
          ohne_zeit_grund: grund,
          ohne_zeit_notiz: grundNotiz.trim() || null,
          ohne_zeit_von: user?.email || null,
          ohne_zeit_am: new Date().toISOString(),
        });
      }
      await onConfirm();
    } catch (err) {
      setFehler(err?.response?.data?.detail || err?.message || 'Speichern fehlgeschlagen');
      setLaeuft(false);
    }
  };

  const reiter = (wert, text) => (
    <button
      type="button"
      onClick={() => setModus(wert)}
      className={`flex-1 h-9 rounded border text-sm font-semibold ${modus === wert ? 'border-foreground bg-muted' : 'border-border text-muted-foreground'}`}
    >
      {text}
    </button>
  );

  return (
    <Dialog open={!!offen} onOpenChange={(o) => !o && !laeuft && onCancel()}>
      <DialogContent className="max-w-md">
        <form onSubmit={absenden}>
          <DialogHeader>
            <DialogTitle>Noch keine Zeit gebucht</DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-3">
            <p className="text-sm text-muted-foreground">
              Auf „{ticket?.title}“ ist keine Zeit gebucht. Support wird nach Aufwand verrechnet — ohne Zeit lässt sich das Ticket nicht abrechnen.
            </p>
            <div className="flex gap-2">
              {reiter('zeit', 'Zeit nachtragen')}
              {reiter('grund', 'Ohne Zeit abschließen')}
            </div>

            {modus === 'zeit' ? (
              <>
                <div>
                  <Label className="text-xs">Dauer in Minuten *</Label>
                  <Input type="number" min="1" step="1" autoFocus value={minuten} onChange={(e) => setMinuten(e.target.value)} placeholder="z. B. 20" />
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {SCHNELL.map((m) => (
                      <button key={m} type="button" onClick={() => setMinuten(String(m))}
                        className={`h-7 px-2.5 rounded border text-xs font-semibold ${min === m ? 'border-foreground' : 'border-border'}`}>
                        {m} min
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Was wurde gemacht? *</Label>
                  <Textarea rows={2} value={notiz} onChange={(e) => setNotiz(e.target.value)} placeholder="z. B. Formular repariert und getestet" />
                </div>
                <p className="text-xs text-muted-foreground">Die Zeit wird heute auf dich und dieses Ticket gebucht.</p>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Warum keine Zeit? *</Label>
                  {OHNE_ZEIT_GRUENDE.map((g) => (
                    <label key={g.wert} className="flex items-start gap-2 text-sm cursor-pointer">
                      <input type="radio" name="ohne_zeit_grund" className="mt-1" checked={grund === g.wert} onChange={() => setGrund(g.wert)} />
                      <span>{g.label}</span>
                    </label>
                  ))}
                </div>
                <div>
                  <Label className="text-xs">Notiz{grund === 'sonstiges' ? ' *' : ''}</Label>
                  <Textarea rows={2} value={grundNotiz} onChange={(e) => setGrundNotiz(e.target.value)} placeholder={grund === 'doppelt' ? 'Welches Ticket?' : ''} />
                </div>
                <p className="text-xs text-muted-foreground">Ob verrechnet wird, entscheidet die Führung in der Support-Abrechnung.</p>
              </>
            )}
            {fehler && <p className="text-xs text-destructive">{fehler}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel} disabled={laeuft}>Abbrechen</Button>
            <Button type="submit" disabled={!bereit || laeuft}>
              {laeuft ? 'Wird gespeichert…' : modus === 'zeit' ? 'Buchen und erledigen' : 'Ohne Zeit erledigen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
