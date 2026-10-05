import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ImagePlus, Loader2, X, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/AuthContext';
import { useZeitKontext } from '@/lib/sprint/ZeitKontext';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import {
  ARTEN, ART_LABEL, STATUS_LABEL, MAX_BILDER, MAX_BYTES, datum,
  NEU_KEY, EIGENE_KEY, ladeEigene, merkeBlick, istInhaber,
} from '@/lib/rueckmeldung/rueckmeldung';

const statusFarbe = (s) =>
  s === 'umgesetzt' ? STATUS_COLORS.doneText : s === 'abgelehnt' ? STATUS_COLORS.neutral : s === 'spaeter' ? STATUS_COLORS.attention : RITTLER.textSecondary;

function Reiter({ aktiv, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[13px] pb-1.5"
      style={{ color: aktiv ? RITTLER.black : RITTLER.textSecondary, fontWeight: aktiv ? 700 : 500, borderBottom: `2px solid ${aktiv ? RITTLER.black : 'transparent'}` }}
    >
      {children}
    </button>
  );
}

function Formular({ onFertig }) {
  const { user } = useAuth();
  const location = useLocation();
  const kontext = useZeitKontext();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);
  const [art, setArt] = useState('fehler');
  const [text, setText] = useState('');
  const [blockiert, setBlockiert] = useState(false);
  const [bilder, setBilder] = useState([]); // { file, url }
  const [ziehen, setZiehen] = useState(false);
  const [hinweis, setHinweis] = useState('');
  const [senden, setSenden] = useState(false);
  const [fehler, setFehler] = useState('');

  // Vorschau-URLs wieder freigeben
  const bilderRef = useRef(bilder);
  bilderRef.current = bilder;
  useEffect(() => () => bilderRef.current.forEach((b) => URL.revokeObjectURL(b.url)), []);

  const hinzufuegen = (dateien) => {
    const liste = Array.from(dateien || []).filter((f) => f && f.type && f.type.startsWith('image/'));
    if (!liste.length) { setHinweis('Bitte ein Bild einfügen (Screenshot, PNG oder JPG).'); return; }
    const zuGross = liste.filter((f) => f.size > MAX_BYTES);
    const passend = liste.filter((f) => f.size <= MAX_BYTES);
    const frei = Math.max(0, MAX_BILDER - bilderRef.current.length);
    const neu = passend.slice(0, frei).map((file, i) => {
      const name = file.name && file.name !== 'image.png' ? file.name : `screenshot-${Date.now()}-${i + 1}.png`;
      const f = new File([file], name, { type: file.type });
      return { file: f, url: URL.createObjectURL(f) };
    });
    if (passend.length > frei) setHinweis(`Höchstens ${MAX_BILDER} Bilder.`);
    else if (zuGross.length) setHinweis('Ein Bild war größer als 10 MB und wurde weggelassen.');
    else setHinweis('');
    if (neu.length) setBilder((alt) => [...alt, ...neu]);
  };

  const entfernen = (url) => {
    URL.revokeObjectURL(url);
    setBilder((alt) => alt.filter((b) => b.url !== url));
  };

  const beimEinfuegen = (e) => {
    const dateien = Array.from(e.clipboardData?.items || [])
      .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (dateien.length) { e.preventDefault(); hinzufuegen(dateien); }
  };

  const absenden = async () => {
    if (!text.trim() || senden) return;
    setSenden(true);
    setFehler('');
    try {
      const urls = await Promise.all(bilder.map(async (b) => (await base44.integrations.Core.UploadFile({ file: b.file })).file_url));
      await base44.entities.Rueckmeldung.create({
        art,
        text: text.trim(),
        blockiert: art === 'fehler' ? blockiert : false,
        bilder: urls,
        seite: `${location.pathname}${location.search}`,
        seiten_titel: document.title || '',
        ...(kontext?.project_id ? { project_id: kontext.project_id } : {}),
        ...(kontext?.ticket_id ? { ticket_id: kontext.ticket_id } : {}),
        person_email: user?.email || 'unbekannt',
        person_name: user?.full_name || '',
        browser: navigator.userAgent,
        bildschirm: `${window.innerWidth}x${window.innerHeight}`,
        status: 'neu',
      });
      queryClient.invalidateQueries({ queryKey: NEU_KEY });
      queryClient.invalidateQueries({ queryKey: EIGENE_KEY(user?.email) });
      onFertig();
    } catch (e) {
      setFehler('Konnte nicht gespeichert werden. Bitte noch einmal versuchen.');
    }
    setSenden(false);
  };

  const hilfe = ARTEN.find((a) => a.value === art)?.hilfe;

  return (
    <div className="space-y-4" onPaste={beimEinfuegen}>
      <div className="flex gap-2">
        {ARTEN.map((a) => {
          const aktiv = a.value === art;
          return (
            <button
              key={a.value}
              type="button"
              onClick={() => setArt(a.value)}
              className="flex-1 h-9 text-[13px] font-semibold"
              style={{ borderRadius: 3, border: `1px solid ${aktiv ? RITTLER.black : RITTLER.line}`, backgroundColor: aktiv ? RITTLER.black : 'transparent', color: aktiv ? RITTLER.white : RITTLER.black }}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <div>
        <Textarea
          autoFocus
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={hilfe}
          className="text-[13.5px]"
          style={{ borderRadius: 3 }}
        />
        {art === 'fehler' && (
          <label className="flex items-center gap-2 mt-2 text-[12.5px] cursor-pointer" style={{ color: RITTLER.black }}>
            <input type="checkbox" checked={blockiert} onChange={(e) => setBlockiert(e.target.checked)} />
            Ich komme deswegen gerade nicht weiter
          </label>
        )}
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setZiehen(true); }}
        onDragLeave={() => setZiehen(false)}
        onDrop={(e) => { e.preventDefault(); setZiehen(false); hinzufuegen(e.dataTransfer.files); }}
        className="p-3"
        style={{ borderRadius: 3, border: `1px dashed ${ziehen ? RITTLER.black : RITTLER.line}`, backgroundColor: ziehen ? RITTLER.surface : 'transparent' }}
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px]" style={{ color: RITTLER.textSecondary }}>
            Screenshot mit <b>Strg+V</b> / <b>⌘V</b> einfügen, hierher ziehen oder
          </p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="shrink-0 h-8 px-3 text-[12.5px] font-semibold flex items-center gap-1.5"
            style={{ borderRadius: 3, border: `1px solid ${RITTLER.line}`, color: RITTLER.black }}
          >
            <ImagePlus className="w-3.5 h-3.5" /> Datei wählen
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { hinzufuegen(e.target.files); e.target.value = ''; }} />
        </div>
        {bilder.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {bilder.map((b) => (
              <div key={b.url} className="relative">
                <img src={b.url} alt="" className="h-16 w-24 object-cover" style={{ borderRadius: 3, border: `1px solid ${RITTLER.line}` }} />
                <button
                  type="button"
                  onClick={() => entfernen(b.url)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: RITTLER.black, color: RITTLER.white }}
                  title="Bild entfernen"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        {hinweis && <p className="text-[11.5px] mt-2" style={{ color: STATUS_COLORS.attention }}>{hinweis}</p>}
      </div>

      <p className="text-[11px]" style={{ color: RITTLER.textSecondary }}>
        Seite, Uhrzeit und das gerade offene Projekt werden automatisch mitgeschickt.
      </p>

      {fehler && <p className="text-[12px]" style={{ color: STATUS_COLORS.critical }}>{fehler}</p>}

      <button
        type="button"
        disabled={!text.trim() || senden}
        onClick={absenden}
        className="w-full h-10 flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wide"
        style={!text.trim() || senden
          ? { borderRadius: 3, backgroundColor: RITTLER.surface, color: RITTLER.textSecondary, cursor: 'not-allowed' }
          : { borderRadius: 3, backgroundColor: RITTLER.pink, color: RITTLER.white }}
      >
        {senden && <Loader2 className="w-4 h-4 animate-spin" />}
        Absenden
      </button>
    </div>
  );
}

function MeineMeldungen() {
  const { user } = useAuth();
  const { data: eigene = [], isLoading } = useQuery({
    queryKey: EIGENE_KEY(user?.email),
    queryFn: () => ladeEigene(user.email),
    enabled: !!user?.email,
  });
  useEffect(() => { merkeBlick(); }, []);

  if (isLoading) return <p className="text-[13px] py-6 text-center" style={{ color: RITTLER.textSecondary }}>Wird geladen …</p>;
  if (!eigene.length) return <p className="text-[13px] py-6 text-center" style={{ color: RITTLER.textSecondary }}>Du hast noch nichts gemeldet.</p>;

  return (
    <div className="max-h-[55vh] overflow-y-auto -mx-1 px-1 space-y-2">
      {eigene.map((r) => (
        <div key={r.id} className="p-3" style={{ borderRadius: 3, border: `1px solid ${RITTLER.line}` }}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase" style={{ letterSpacing: '0.8px', color: RITTLER.textSecondary }}>
              {ART_LABEL[r.art] || r.art} · {datum(r.created_date)}
            </span>
            <span className="text-[12px] font-semibold" style={{ color: statusFarbe(r.status) }}>{STATUS_LABEL[r.status] || 'Neu'}</span>
          </div>
          <p className="text-[13px] mt-1 whitespace-pre-wrap line-clamp-3" style={{ color: RITTLER.black }}>{r.text}</p>
          {r.antwort && (
            <p className="text-[12.5px] mt-2 pl-2 whitespace-pre-wrap" style={{ borderLeft: `2px solid ${RITTLER.black}`, color: RITTLER.black }}>
              <span className="font-semibold">Antwort: </span>{r.antwort}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function RueckmeldungDialog({ open, onOpenChange, neuAnzahl = 0, startReiter = 'neu' }) {
  const { user } = useAuth();
  const inhaber = istInhaber(user);
  const [reiter, setReiter] = useState(startReiter);
  const [danke, setDanke] = useState(false);

  useEffect(() => {
    if (open) { setReiter(startReiter); setDanke(false); }
  }, [open, startReiter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" style={{ borderRadius: 3 }}>
        <DialogHeader>
          <DialogTitle className="text-[17px] font-extrabold uppercase tracking-tight">Rückmeldung</DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between gap-3 border-b" style={{ borderColor: RITTLER.line }}>
          <div className="flex gap-5">
            <Reiter aktiv={reiter === 'neu'} onClick={() => { setReiter('neu'); setDanke(false); }}>Neue Rückmeldung</Reiter>
            <Reiter aktiv={reiter === 'meine'} onClick={() => setReiter('meine')}>Meine Meldungen</Reiter>
          </div>
          {inhaber && (
            <Link to="/rueckmeldungen" onClick={() => onOpenChange(false)} className="text-[12px] pb-1.5 underline" style={{ color: RITTLER.textSecondary }}>
              Sammlung öffnen{neuAnzahl > 0 ? ` (${neuAnzahl} neu)` : ''}
            </Link>
          )}
        </div>

        {reiter === 'neu' && !danke && <Formular onFertig={() => setDanke(true)} />}
        {reiter === 'neu' && danke && (
          <div className="py-6 text-center">
            <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: STATUS_COLORS.doneSurface, color: STATUS_COLORS.doneText }}>
              <Check className="w-5 h-5" />
            </div>
            <p className="text-[15px] font-bold mt-3" style={{ color: RITTLER.black }}>Danke, ist angekommen.</p>
            <p className="text-[12.5px] mt-1" style={{ color: RITTLER.textSecondary }}>Den Stand siehst du jederzeit unter „Meine Meldungen“.</p>
            <div className="flex justify-center gap-4 mt-4 text-[12.5px] underline" style={{ color: RITTLER.textSecondary }}>
              <button type="button" onClick={() => setDanke(false)}>Noch etwas melden</button>
              <button type="button" onClick={() => onOpenChange(false)}>Schließen</button>
            </div>
          </div>
        )}
        {reiter === 'meine' && <MeineMeldungen />}
      </DialogContent>
    </Dialog>
  );
}
