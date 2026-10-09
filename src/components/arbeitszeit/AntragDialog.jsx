import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { wienUhr, wienIso, tagKurz, dauer } from '@/lib/arbeitszeit/wienZeit';

// Ein Antrag — es gibt kein direktes Eintragen. Was hier abgeschickt wird, ändert erst etwas,
// wenn Alfons es genehmigt. Eine Vorgangsnummer je geöffnetem Dialog: zweimal Absenden
// (Doppelklick, Netzfehler) erzeugt nur einen Antrag.
//
// vorlage: { typ, tag, wochentag, stempel?, buchung?, entwurf? }
//   typ: stempel_aendern | stempel_loeschen | stempel_fehlt | buchung_aendern | buchung_loeschen
//        | gehen_angeben | ende_angeben

const ART_TEXT = { kommen: 'Kommen', pause_start: 'Pause Beginn', pause_ende: 'Pause Ende', gehen: 'Gehen' };
export const artText = (a) => ART_TEXT[a] || a;

const TITEL = {
  stempel_aendern: 'Uhrzeit ändern',
  stempel_loeschen: 'Stempel entfernen',
  stempel_fehlt: 'Fehlenden Stempel beantragen',
  buchung_aendern: 'Projektzeit ändern',
  buchung_loeschen: 'Buchung entfernen',
  gehen_angeben: 'Wann bist du gegangen?',
  ende_angeben: 'Wann hast du aufgehört?',
};

const vorgangsnummer = () => { try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random()}`; } };

export default function AntragDialog({ vorlage, onClose, onGestellt }) {
  const offen = !!vorlage;
  const [uhr, setUhr] = useState('');
  const [von, setVon] = useState('');
  const [bis, setBis] = useState('');
  const [art, setArt] = useState('kommen');
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState('');
  const [sendet, setSendet] = useState(false);
  const vorgang = useMemo(() => (vorlage ? vorgangsnummer() : null), [vorlage]);

  useEffect(() => {
    if (!vorlage) return;
    setFehler(''); setGrund(''); setArt('kommen');
    setUhr(vorlage.stempel ? wienUhr(vorlage.stempel.zeit) : '');
    setVon(vorlage.buchung?.started_at ? wienUhr(vorlage.buchung.started_at) : '');
    setBis(vorlage.buchung?.ended_at ? wienUhr(vorlage.buchung.ended_at) : '');
  }, [vorlage]);

  if (!vorlage) return null;
  const { typ, tag } = vorlage;

  const absenden = async () => {
    setFehler('');
    let eingabe;
    if (typ === 'stempel_aendern') eingabe = { ziel: 'stempel', art: 'aendern', ziel_id: vorlage.stempel.id, nachher: { zeit: wienIso(tag, uhr) } };
    else if (typ === 'stempel_loeschen') eingabe = { ziel: 'stempel', art: 'loeschen', ziel_id: vorlage.stempel.id };
    else if (typ === 'stempel_fehlt') eingabe = { ziel: 'stempel', art: 'nachtragen', nachher: { art, zeit: wienIso(tag, uhr) } };
    else if (typ === 'buchung_aendern') eingabe = { ziel: 'buchung', art: 'aendern', ziel_id: vorlage.buchung.id, nachher: { started_at: wienIso(tag, von), ended_at: wienIso(tag, bis) } };
    else if (typ === 'buchung_loeschen') eingabe = { ziel: 'buchung', art: 'loeschen', ziel_id: vorlage.buchung.id };
    else if (typ === 'gehen_angeben') eingabe = { antrag_id: vorlage.entwurf.id, nachher: { zeit: wienIso(tag, uhr) } };
    else if (typ === 'ende_angeben') eingabe = { antrag_id: vorlage.entwurf.id, nachher: { bis: wienIso(tag, bis) } };
    if ((['stempel_aendern', 'stempel_fehlt', 'gehen_angeben'].includes(typ) && !uhr)
      || (typ === 'buchung_aendern' && (!von || !bis)) || (typ === 'ende_angeben' && !bis)) {
      setFehler('Bitte die Uhrzeit angeben.');
      return;
    }
    if (grund.trim().length < 5) { setFehler('Bitte kurz begründen.'); return; }
    setSendet(true);
    try {
      const res = await base44.functions.invoke('arbeitszeit', { aktion: 'stellen', tag, grund: grund.trim(), vorgang_id: vorgang, ...eingabe });
      const d = res?.data || {};
      if (d.fehler) { setFehler(d.fehler); return; }
      onGestellt?.();
      onClose();
    } catch (e) {
      setFehler(e?.response?.data?.fehler || 'Keine Verbindung — bitte noch einmal absenden (es entsteht nur ein Antrag).');
    } finally {
      setSendet(false);
    }
  };

  const feld = (label, wert, setzen) => (
    <div className="flex-1">
      <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>{label}</label>
      <Input type="time" value={wert} onChange={(e) => setzen(e.target.value)} />
    </div>
  );

  const b = vorlage.buchung;
  const e = vorlage.entwurf;
  return (
    <Dialog open={offen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold">{TITEL[typ]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p style={{ color: RITTLER.textSecondary }}>
            {tagKurz(tag, vorlage.wochentag)}
            {vorlage.stempel && ` · ${artText(vorlage.stempel.art)} ${wienUhr(vorlage.stempel.zeit)}`}
            {b && ` · ${b.projekt || 'Projekt'} ${b.started_at ? `${wienUhr(b.started_at)}–${wienUhr(b.ended_at)}` : ''} (${dauer(b.duration_minutes)} h)`}
            {typ === 'gehen_angeben' && e && ` · gekommen ${wienUhr(e.vorher?.kommen)}, automatisch beendet ${wienUhr(e.vorher?.automatisch_beendet_am)}`}
            {typ === 'ende_angeben' && e && ` · ${e.projekt || 'Projekt'}, Timer seit ${wienUhr(e.nachher?.von)}, automatisch angehalten ${wienUhr(e.vorher?.automatisch_angehalten_am)}`}
          </p>

          {typ === 'stempel_fehlt' && (
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>Was fehlt</label>
                <select className="w-full h-9 px-2 rounded border text-sm bg-white" style={{ borderColor: RITTLER.line }} value={art} onChange={(ev) => setArt(ev.target.value)}>
                  {Object.entries(ART_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              {feld('Uhrzeit', uhr, setUhr)}
            </div>
          )}
          {['stempel_aendern', 'gehen_angeben'].includes(typ) && <div className="flex gap-2">{feld(typ === 'gehen_angeben' ? 'Gegangen um' : 'Neue Uhrzeit', uhr, setUhr)}</div>}
          {typ === 'buchung_aendern' && <div className="flex gap-2">{feld('Von', von, setVon)}{feld('Bis', bis, setBis)}</div>}
          {typ === 'ende_angeben' && <div className="flex gap-2">{feld('Aufgehört um', bis, setBis)}</div>}

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>Grund</label>
            <Input autoFocus={typ.endsWith('loeschen')} placeholder="z. B. Kommen vergessen zu drücken" value={grund} onChange={(ev) => setGrund(ev.target.value)} />
          </div>
          <p className="text-xs" style={{ color: RITTLER.textSecondary }}>Wird erst wirksam, wenn der Antrag genehmigt ist.</p>
          {fehler && <p className="text-xs font-semibold" style={{ color: STATUS_COLORS.critical }}>{fehler}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
              Abbrechen
            </button>
            <button type="button" disabled={sendet} onClick={absenden} className="h-9 px-4 rounded border text-xs font-bold uppercase tracking-wide disabled:opacity-50" style={{ borderColor: RITTLER.black, color: RITTLER.black }}>
              {sendet ? 'Sendet…' : 'Antrag stellen'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
