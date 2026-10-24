import React, { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { standardTermin, addWorkdays } from '@/lib/sprint/deadlines';
import { zustaendigFelder } from '@/lib/sprint/zustaendige';
import { ticketBereinigen } from '@/lib/sprint/ticketBereinigen';

// Aufräumen des eigenen Vorrats ohne Termin (Audit 24.10.2026: 82 % der offenen Tickets hatten keinen Termin).
// Je Aufgabe: Termin geben, an jemand anderen abgeben oder — mit Führungsrecht — als Altbestand archivieren.
// Mehrere markieren und gemeinsam einplanen geht auch. Zeitbuchungen bleiben immer unberührt.
const heuteIso = () => new Date().toISOString().slice(0, 10);

export default function MeinTagAufraeumen({ open, onOpenChange, tickets = [], projektName, projectById, members = [], email, darfArchivieren, onFertig }) {
  const [termine, setTermine] = useState({});
  const [markiert, setMarkiert] = useState({});
  const [busy, setBusy] = useState('');
  const [meldung, setMeldung] = useState('');
  const [erledigt, setErledigt] = useState({});

  const liste = useMemo(() => tickets.filter((t) => !erledigt[t.id]), [tickets, erledigt]);
  const gewaehlt = liste.filter((t) => markiert[t.id]).map((t) => t.id);
  const terminVon = (t) => termine[t.id] || standardTermin();
  const andere = members.filter((m) => (m.email || '').toLowerCase() !== (email || '').toLowerCase());

  const fertig = (ids, text) => {
    setErledigt((e) => ({ ...e, ...Object.fromEntries(ids.map((id) => [id, true])) }));
    setMarkiert({});
    setMeldung(text);
    onFertig?.();
  };

  const terminSetzen = async (ids, datumVon) => {
    setBusy('termin');
    try {
      await Promise.all(ids.map((id) => base44.entities.Ticket.update(id, { planned_for: datumVon(id) })));
      fertig(ids, `${ids.length} Aufgabe${ids.length === 1 ? '' : 'n'} eingeplant.`);
    } catch (e) {
      setMeldung(`Speichern fehlgeschlagen: ${e?.message || e}`);
    }
    setBusy('');
  };

  // Mehrere auf einmal: auf die nächsten Arbeitstage verteilen, höchstens drei je Tag — nicht alle auf denselben Tag
  const gemeinsamEinplanen = () => {
    const start = standardTermin();
    const tagFuer = Object.fromEntries(gewaehlt.map((id, i) => [id, addWorkdays(start, Math.floor(i / 3))]));
    return terminSetzen(gewaehlt, (id) => tagFuer[id]);
  };

  const abgeben = async (t, an) => {
    if (!an) return;
    setBusy(`abgeben-${t.id}`);
    try {
      await base44.entities.Ticket.update(t.id, { ...zustaendigFelder([an]), planned_for: terminVon(t) });
      const name = members.find((m) => m.email === an)?.name || an;
      fertig([t.id], `„${t.title}" an ${name} abgegeben.`);
    } catch (e) {
      setMeldung(`Abgeben fehlgeschlagen: ${e?.message || e}`);
    }
    setBusy('');
  };

  const archivieren = async (ids) => {
    if (!window.confirm(`${ids.length} Aufgabe${ids.length === 1 ? '' : 'n'} als „Altbestand aWork" archivieren?\nSie verschwinden aus allen Arbeitsansichten, Zeitbuchungen bleiben erhalten, Wiederherstellen ist möglich.`)) return;
    setBusy('archiv');
    try {
      const res = await ticketBereinigen('archivieren', ids, 'altbestand_awork');
      const ok = res.erledigt.map((x) => (typeof x === 'string' ? x : x?.id)).filter(Boolean);
      fertig(ok.length ? ok : [], `${ok.length} archiviert${res.abgelehnt.length ? `, ${res.abgelehnt.length} abgelehnt` : ''}.`);
    } catch (e) {
      setMeldung(`Archivieren fehlgeschlagen: ${e?.message || e}`);
    }
    setBusy('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[860px] max-h-[88vh] overflow-y-auto" style={{ borderRadius: 4 }}>
        <DialogHeader>
          <DialogTitle>Vorrat aufräumen — {liste.length} Aufgabe{liste.length === 1 ? '' : 'n'} ohne Termin</DialogTitle>
          <DialogDescription>
            Gib jeder Aufgabe einen Termin, gib sie ab, wenn sie nicht zu dir gehört{darfArchivieren ? ', oder archiviere Altbestand, der nicht mehr gebraucht wird' : ''}. Vorschlag: in 5 Arbeitstagen.
          </DialogDescription>
        </DialogHeader>

        {liste.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={gewaehlt.length === liste.length}
                onChange={(e) => setMarkiert(e.target.checked ? Object.fromEntries(liste.map((t) => [t.id, true])) : {})}
              />
              alle markieren
            </label>
            <span style={{ color: RITTLER.textSecondary }}>{gewaehlt.length} markiert</span>
            <button
              type="button"
              disabled={!gewaehlt.length || !!busy}
              onClick={gemeinsamEinplanen}
              className="h-8 px-3 font-semibold disabled:opacity-50"
              style={{ borderRadius: 3, border: `1px solid ${RITTLER.black}`, backgroundColor: RITTLER.black, color: RITTLER.white }}
              title="Ab dem Vorschlagstermin, höchstens drei Aufgaben je Arbeitstag"
            >
              Markierte einplanen
            </button>
            {darfArchivieren && (
              <button
                type="button"
                disabled={!gewaehlt.length || !!busy}
                onClick={() => archivieren(gewaehlt)}
                className="h-8 px-3 font-semibold disabled:opacity-50"
                style={{ borderRadius: 3, border: `1px solid ${RITTLER.line}`, backgroundColor: RITTLER.white, color: RITTLER.black }}
              >
                Markierte archivieren (Altbestand)
              </button>
            )}
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          </div>
        )}
        {meldung && <p className="text-[12.5px]" style={{ color: RITTLER.black }}>{meldung}</p>}

        {liste.length === 0 ? (
          <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>Alles eingeplant — nichts mehr ohne Termin.</p>
        ) : (
          <div className="divide-y border" style={{ borderColor: RITTLER.line, borderRadius: 3 }}>
            {liste.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <input type="checkbox" checked={!!markiert[t.id]} onChange={(e) => setMarkiert((m) => ({ ...m, [t.id]: e.target.checked }))} />
                <div className="flex-1 min-w-[220px]">
                  <p className="text-[13px] font-semibold" style={{ color: RITTLER.black }}>{t.title}</p>
                  <p className="text-[11.5px]" style={{ color: RITTLER.textSecondary }}>
                    {projektName(projectById[t.project_id])}{t.status === 'in_arbeit' ? ' · in Arbeit' : ''}
                  </p>
                </div>
                <input
                  type="date"
                  min={heuteIso()}
                  value={terminVon(t)}
                  onChange={(e) => setTermine((x) => ({ ...x, [t.id]: e.target.value }))}
                  className="h-8 px-2 text-[12.5px] border bg-background"
                  style={{ borderRadius: 3, borderColor: RITTLER.line }}
                  aria-label="Termin"
                />
                <button
                  type="button"
                  disabled={!!busy}
                  onClick={() => terminSetzen([t.id], () => terminVon(t))}
                  className="h-8 px-3 text-[12.5px] font-semibold disabled:opacity-50"
                  style={{ borderRadius: 3, border: `1px solid ${RITTLER.black}`, backgroundColor: RITTLER.white, color: RITTLER.black }}
                >
                  Einplanen
                </button>
                <select
                  value=""
                  disabled={!!busy}
                  onChange={(e) => abgeben(t, e.target.value)}
                  className="h-8 px-2 text-[12.5px] border bg-background"
                  style={{ borderRadius: 3, borderColor: RITTLER.line, maxWidth: 150 }}
                  aria-label="Abgeben an"
                >
                  <option value="">Abgeben an …</option>
                  {andere.map((m) => <option key={m.email} value={m.email}>{m.name}</option>)}
                </select>
                {darfArchivieren && (
                  <button
                    type="button"
                    disabled={!!busy}
                    onClick={() => archivieren([t.id])}
                    className="h-8 px-2 text-[12.5px] underline disabled:opacity-50"
                    style={{ color: RITTLER.textSecondary }}
                  >
                    Archivieren
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
