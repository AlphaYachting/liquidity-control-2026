import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { wienUhr, wienIso } from '@/lib/arbeitszeit/wienZeit';

// Antrag zu einem Stempel (Kommen, Pause, Gehen) — wirkt erst nach Genehmigung.
// Eine Vorgangsnummer je geöffnetem Dialog: zweimal Absenden erzeugt nur einen Antrag.
// vorlage: { typ, tag, stempel?, entwurf? }
//   typ: stempel_aendern | stempel_loeschen | stempel_fehlt | gehen_angeben | ende_angeben

const ART_TEXT = { kommen: 'Kommen', pause_start: 'Pause Beginn', pause_ende: 'Pause Ende', gehen: 'Gehen' };
export const artText = (a) => ART_TEXT[a] || a;

const TITEL = {
  stempel_aendern: 'Uhrzeit ändern',
  stempel_loeschen: 'Stempel entfernen',
  stempel_fehlt: 'Fehlenden Stempel beantragen',
  gehen_angeben: 'Wann bist du gegangen?',
  ende_angeben: 'Wann hast du aufgehört?',
};

const vorgangsnummer = () => { try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random()}`; } };
const tagText = (t) => `${t.slice(8, 10)}.${t.slice(5, 7)}.`;

export default function StempelAntragDialog({ vorlage, onClose, onGestellt }) {
  const [uhr, setUhr] = useState('');
  const [art, setArt] = useState('kommen');
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState('');
  const [sendet, setSendet] = useState(false);
  const vorgang = useMemo(() => (vorlage ? vorgangsnummer() : null), [vorlage]);

  useEffect(() => {
    if (!vorlage) return;
    setFehler(''); setGrund(''); setArt('kommen');
    setUhr(vorlage.stempel ? wienUhr(vorlage.stempel.zeit) : '');
  }, [vorlage]);

  if (!vorlage) return null;
  const { typ, tag } = vorlage;
  const e = vorlage.entwurf;

  const absenden = async () => {
    setFehler('');
    if (typ !== 'stempel_loeschen' && !uhr) { setFehler('Bitte die Uhrzeit angeben.'); return; }
    if (grund.trim().length < 5) { setFehler('Bitte kurz begründen.'); return; }
    let eingabe;
    if (typ === 'stempel_aendern') eingabe = { ziel: 'stempel', art: 'aendern', ziel_id: vorlage.stempel.id, nachher: { zeit: wienIso(tag, uhr) } };
    else if (typ === 'stempel_loeschen') eingabe = { ziel: 'stempel', art: 'loeschen', ziel_id: vorlage.stempel.id };
    else if (typ === 'stempel_fehlt') eingabe = { ziel: 'stempel', art: 'nachtragen', nachher: { art, zeit: wienIso(tag, uhr) } };
    else if (typ === 'gehen_angeben') eingabe = { antrag_id: e.id, nachher: { zeit: wienIso(tag, uhr) } };
    else if (typ === 'ende_angeben') eingabe = { antrag_id: e.id, nachher: { bis: wienIso(tag, uhr) } };
    setSendet(true);
    try {
      const res = await base44.functions.invoke('zeitantrag', { aktion: 'stellen', tag, grund: grund.trim(), vorgang_id: vorgang, ...eingabe });
      const d = res?.data || {};
      if (d.fehler) { setFehler(d.fehler); return; }
      onGestellt?.();
      onClose();
    } catch (err) {
      setFehler(err?.response?.data?.fehler || 'Keine Verbindung — bitte noch einmal absenden (es entsteht nur ein Antrag).');
    } finally {
      setSendet(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="uppercase font-bold">{TITEL[typ]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p style={{ color: RITTLER.textSecondary }}>
            {tagText(tag)}
            {vorlage.stempel && ` · ${artText(vorlage.stempel.art)} ${wienUhr(vorlage.stempel.zeit)}`}
            {typ === 'gehen_angeben' && e && ` · gekommen ${wienUhr(e.vorher?.kommen)}, automatisch beendet ${wienUhr(e.vorher?.automatisch_beendet_am)}`}
            {typ === 'ende_angeben' && e && ` · ${e.nachher?.projekt_titel || 'Projekt'}, Timer seit ${wienUhr(e.nachher?.von)}`}
          </p>
          <div className="flex gap-2">
            {typ === 'stempel_fehlt' && (
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>Was fehlt</label>
                <select className="w-full h-9 px-2 rounded border text-sm bg-white" style={{ borderColor: RITTLER.line }} value={art} onChange={(ev) => setArt(ev.target.value)}>
                  {Object.entries(ART_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            )}
            {typ !== 'stempel_loeschen' && (
              <div className="flex-1">
                <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>
                  {typ === 'gehen_angeben' ? 'Gegangen um' : typ === 'ende_angeben' ? 'Aufgehört um' : 'Uhrzeit'}
                </label>
                <Input type="time" value={uhr} onChange={(ev) => setUhr(ev.target.value)} />
              </div>
            )}
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>Grund</label>
            <Input placeholder="z. B. Gehen vergessen zu drücken" value={grund} onChange={(ev) => setGrund(ev.target.value)} />
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
