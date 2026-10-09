import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { wienUhr } from '@/lib/arbeitszeit/wienZeit';
import { artText } from './StempelAntragDialog';

// Anträge zur Anwesenheit in „Meine Zeiten“ — erscheint nur, wenn es etwas gibt:
//   Zu klären     — die Automatik hat etwas beendet (Gehen vergessen, Timer angehalten); hier die Uhrzeit angeben
//   Meine Anträge — offen oder kürzlich entschieden, mit Antwort; offene lassen sich zurückziehen
//   Genehmigen    — nur für den Genehmiger: alle offenen Anträge des Teams

const tagText = (t) => `${t.slice(8, 10)}.${t.slice(5, 7)}.`;
const STATUS_TEXT = { offen: 'offen', genehmigt: 'genehmigt', abgelehnt: 'abgelehnt', zurueckgezogen: 'zurückgezogen' };

export function antragText(a) {
  const n = a.nachher || {};
  const v = a.vorher || {};
  if (a.art === 'aendern') return `${artText(v.art)} ${wienUhr(v.zeit)} → ${wienUhr(n.zeit)}`;
  if (a.art === 'loeschen') return `${artText(v.art)} ${wienUhr(v.zeit)} entfernen`;
  if (a.art === 'nachtragen') return `${artText(n.art)} ${wienUhr(n.zeit)} (fehlte)`;
  if (a.art === 'gehen_angeben') return `Gehen ${wienUhr(n.zeit)} (automatisch beendet ${wienUhr(v.automatisch_beendet_am)})`;
  if (a.art === 'ende_angeben') return `${n.projekt_titel || 'Projekt'} ${wienUhr(n.von)}–${wienUhr(n.bis)} (Timer angehalten)`;
  return a.art;
}

const Knopf = ({ onClick, children, stark, disabled }) => (
  <button type="button" disabled={disabled} onClick={onClick}
    className="h-8 px-3 rounded border text-xs font-bold uppercase tracking-wide shrink-0 disabled:opacity-40"
    style={{ borderColor: stark ? RITTLER.black : RITTLER.line, color: stark ? RITTLER.black : RITTLER.textSecondary }}>
    {children}
  </button>
);

export default function AnwesenheitsAntraege({ antraege, onAusfuellen, onGeaendert }) {
  const [auswahl, setAuswahl] = useState([]);
  const [kommentar, setKommentar] = useState('');
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState('');
  if (!antraege) return null;

  const eigene = antraege.eigene || [];
  const zuKlaeren = eigene.filter((a) => a.status === 'entwurf');
  const meine = eigene.filter((a) => a.status === 'offen' || ((a.status === 'genehmigt' || a.status === 'abgelehnt')
    && a.entschieden_am && Date.now() - Date.parse(a.entschieden_am) < 7 * 24 * 3600 * 1000));
  const offenAlle = antraege.genehmiger ? (antraege.offenAlle || []) : [];
  if (!zuKlaeren.length && !meine.length && !offenAlle.length) return null;

  const aufruf = async (daten) => {
    setBusy(true); setMeldung('');
    try {
      const res = await base44.functions.invoke('zeitantrag', daten);
      const d = res?.data || {};
      const fehlerListe = (d.ergebnis || []).filter((x) => x.fehler);
      if (d.fehler) setMeldung(d.fehler);
      else if (fehlerListe.length) setMeldung(fehlerListe.map((x) => x.fehler).join(' · '));
      else { setAuswahl([]); setKommentar(''); }
    } catch (e) {
      setMeldung(e?.response?.data?.fehler || 'Keine Verbindung — bitte erneut versuchen.');
    } finally {
      setBusy(false);
      onGeaendert?.();
    }
  };

  return (
    <div className="space-y-2">
      {zuKlaeren.length > 0 && (
        <div className="rounded p-3 space-y-2" style={{ backgroundColor: STATUS_COLORS.attentionSurface, border: `1.5px solid ${STATUS_COLORS.attention}` }}>
          <p className="text-sm font-bold" style={{ color: STATUS_COLORS.attention }}>Zu klären — hier fehlt deine Angabe</p>
          {zuKlaeren.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded border px-3 py-2" style={{ borderColor: RITTLER.line }}>
              <p className="text-sm">
                <b>{tagText(e.tag)}</b>{' '}
                {e.art === 'gehen_angeben'
                  ? `Gehen nicht gestempelt — gekommen ${wienUhr(e.vorher?.kommen)}, automatisch beendet ${wienUhr(e.vorher?.automatisch_beendet_am)}.`
                  : `Timer auf ${e.nachher?.projekt_titel || 'Projekt'} lief seit ${wienUhr(e.nachher?.von)} und wurde automatisch angehalten.`}
              </p>
              <Knopf stark onClick={() => onAusfuellen({ typ: e.art, tag: e.tag, entwurf: e })}>
                {e.art === 'gehen_angeben' ? 'Gehen angeben' : 'Ende angeben'}
              </Knopf>
            </div>
          ))}
        </div>
      )}

      {offenAlle.length > 0 && (
        <div className="bg-white rounded border" style={{ borderColor: RITTLER.line }}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: RITTLER.line }}>
            <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>Anträge zur Genehmigung · {offenAlle.length}</p>
            <div className="flex items-center gap-2">
              <input value={kommentar} onChange={(e) => setKommentar(e.target.value)} placeholder="Kommentar (bei Ablehnung Pflicht)"
                className="h-8 px-2 rounded border text-xs w-[220px]" style={{ borderColor: RITTLER.line }} />
              <Knopf stark disabled={busy || !auswahl.length} onClick={() => aufruf({ aktion: 'entscheiden', ids: auswahl, entscheidung: 'genehmigt', kommentar })}>
                Genehmigen ({auswahl.length})
              </Knopf>
              <Knopf disabled={busy || !auswahl.length} onClick={() => aufruf({ aktion: 'entscheiden', ids: auswahl, entscheidung: 'abgelehnt', kommentar })}>
                Ablehnen
              </Knopf>
            </div>
          </div>
          {meldung && <p className="px-3 py-2 text-xs font-semibold" style={{ color: STATUS_COLORS.critical }}>{meldung}</p>}
          <div className="divide-y" style={{ borderColor: RITTLER.line }}>
            {offenAlle.map((a) => (
              <label key={a.id} className="flex items-start gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <input type="checkbox" className="mt-1" checked={auswahl.includes(a.id)}
                  onChange={(e) => setAuswahl((l) => (e.target.checked ? [...l, a.id] : l.filter((x) => x !== a.id)))} />
                <span className="flex-1 min-w-0">
                  <b>{a.person_name}</b> · {tagText(a.tag)} · {antragText(a)}
                  <span className="block text-xs" style={{ color: RITTLER.textSecondary }}>„{a.grund}“</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {meine.length > 0 && (
        <div className="bg-white rounded border" style={{ borderColor: RITTLER.line }}>
          <p className="px-3 py-2 border-b text-[11px] font-bold uppercase tracking-[2px]" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>Meine Anträge</p>
          <div className="divide-y" style={{ borderColor: RITTLER.line }}>
            {meine.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="w-[60px] font-semibold tabular-nums">{tagText(a.tag)}</span>
                <span className="flex-1 min-w-[200px]">
                  {antragText(a)}
                  <span className="block text-xs" style={{ color: RITTLER.textSecondary }}>„{a.grund}“{a.kommentar ? ` — Antwort: ${a.kommentar}` : ''}</span>
                </span>
                <span className="text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px]"
                  style={a.status === 'genehmigt' ? { color: STATUS_COLORS.doneText, backgroundColor: STATUS_COLORS.doneSurface } : { color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }}>
                  {STATUS_TEXT[a.status] || a.status}
                </span>
                {a.status === 'offen' && (
                  <button type="button" className="text-xs underline" style={{ color: RITTLER.textSecondary }} disabled={busy}
                    onClick={() => aufruf({ aktion: 'zurueckziehen', antrag_id: a.id })}>Zurückziehen</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
