import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { emailApi } from '@/components/crm/emails/emailApi';
import { eintragAendern } from '@/components/crm/inboxDecision';
import { postDatum } from '@/components/post/PostBaukasten';

// Sammelentscheidung für den Rückstau im Posteingang (Audit 24.10.2026: über die Hälfte der offenen
// Fälle war älter als 14 Tage). Nichts passiert automatisch: Die Liste wird gezeigt, die Person wählt ab,
// was noch eine Antwort braucht, und markiert den Rest als erledigt.
// Eskalationen und zugewiesene Fälle sind ausgenommen — die haben eine eigene Zuständigkeit.
// Erledigt heißt wie beim Einzelknopf: Die Konversation kommt bei der nächsten Kundennachricht zurück.
export const SAMMEL_TAGE = 14;
const GRUND = `Sammelentscheidung: älter als ${SAMMEL_TAGE} Tage`;

export default function PostSammelentscheidung({ eintraege = [], onFertig }) {
  const [offen, setOffen] = useState(false);
  const [abgewaehlt, setAbgewaehlt] = useState({});
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState('');

  const grenze = Date.now() - SAMMEL_TAGE * 24 * 3600 * 1000;
  const alt = useMemo(
    () => eintraege
      .filter((e) => e.eingang && e.eingang < grenze && !e.eskalation && !e.zustaendig)
      .sort((a, b) => a.eingang - b.eingang),
    [eintraege, grenze],
  );
  const gewaehlt = alt.filter((e) => !abgewaehlt[e.key]);

  if (alt.length === 0) return null;

  const ausfuehren = async () => {
    if (!window.confirm(`${gewaehlt.length} Fälle als erledigt markieren?\nSie verschwinden aus dem Posteingang und kommen zurück, sobald der Kunde wieder schreibt.`)) return;
    setBusy(true);
    setMeldung('');
    let ok = 0;
    const fehler = [];
    for (const e of gewaehlt) {
      try {
        if (e.threadId) {
          await emailApi('enrich', { thread_id: Number(e.threadId), fields: { crm_status: 'kein_lead', status: 'erledigt' } });
        }
        if (e.item?.id && e.item.decision === 'offen') {
          await eintragAendern(e.item.id, { decision: 'verworfen', status: 'dismissed', dismiss_reason: GRUND });
        }
        ok += 1;
      } catch (err) {
        fehler.push(`${e.betreff || 'ohne Betreff'}: ${err?.message || err}`);
      }
    }
    setBusy(false);
    setAbgewaehlt({});
    setMeldung(`${ok} als erledigt markiert${fehler.length ? ` · ${fehler.length} fehlgeschlagen (${fehler.slice(0, 2).join('; ')})` : ''}.`);
    onFertig?.();
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border bg-background" style={{ borderColor: RITTLER.line, borderRadius: 4 }}>
        <p className="text-[13px] flex-1 min-w-[240px]" style={{ color: RITTLER.black }}>
          <strong>{alt.length}</strong> offene Fälle sind älter als {SAMMEL_TAGE} Tage und niemandem zugewiesen.
        </p>
        <button
          type="button"
          onClick={() => { setOffen(true); setMeldung(''); }}
          className="h-9 px-4 text-[13px] font-semibold"
          style={{ borderRadius: 3, border: `1px solid ${RITTLER.black}`, backgroundColor: RITTLER.white, color: RITTLER.black }}
        >
          Gesammelt entscheiden
        </button>
      </div>
      <Dialog open={offen} onOpenChange={setOffen}>
        <DialogContent className="max-w-[760px] max-h-[88vh] overflow-y-auto" style={{ borderRadius: 4 }}>
          <DialogHeader>
            <DialogTitle>Rückstau entscheiden — älter als {SAMMEL_TAGE} Tage</DialogTitle>
            <DialogDescription>
              Häkchen entfernen bei allem, was noch eine Antwort braucht. Der Rest wird als erledigt markiert und kommt zurück, sobald der Kunde wieder schreibt. Eskalationen und zugewiesene Fälle stehen nicht in dieser Liste.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y border" style={{ borderColor: RITTLER.line, borderRadius: 3 }}>
            {alt.map((e) => (
              <label key={e.key} className="flex items-start gap-2.5 px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={!abgewaehlt[e.key]}
                  onChange={(ev) => setAbgewaehlt((a) => ({ ...a, [e.key]: !ev.target.checked }))}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold truncate" style={{ color: RITTLER.black }}>{e.betreff || 'ohne Betreff'}</span>
                  <span className="block text-[11.5px]" style={{ color: RITTLER.textSecondary }}>
                    {[e.absenderName || e.absender, e.thread?.customer, postDatum(e.eingang)].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {meldung && <p className="text-[12.5px] flex-1" style={{ color: RITTLER.black }}>{meldung}</p>}
            <button
              type="button"
              onClick={() => setOffen(false)}
              className="h-9 px-4 text-[13px] font-semibold"
              style={{ borderRadius: 3, border: `1px solid ${RITTLER.line}`, backgroundColor: RITTLER.white, color: RITTLER.black }}
            >
              Schließen
            </button>
            <button
              type="button"
              disabled={!gewaehlt.length || busy}
              onClick={ausfuehren}
              className="h-9 px-4 text-[13px] font-semibold flex items-center gap-2 disabled:opacity-50"
              style={{ borderRadius: 3, backgroundColor: RITTLER.black, color: RITTLER.white }}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {gewaehlt.length} als erledigt markieren
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
