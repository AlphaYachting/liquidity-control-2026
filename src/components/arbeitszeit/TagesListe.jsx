import React from 'react';
import { ChevronDown, ChevronUp, Pencil, Trash2, Plus, LogIn, LogOut, Coffee, Play, Circle } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import { zeitleiste } from '@/lib/arbeitszeit/zeitleiste';
import { wienUhr, tagKurz, dauer, saldo } from '@/lib/arbeitszeit/wienZeit';
import { artText } from './AntragDialog';

// Ein Tag in „Meine Zeiten“: Kopf mit den Summen, darunter EINE Liste nach Uhrzeit —
// Gekommen, Arbeit begonnen, Pause, Arbeit begonnen, Gegangen. Anwesenheit und Projektarbeit gemischt.
// Änderungen nur als Antrag (Stift / Papierkorb), eintragen gibt es nicht.

const HINWEIS = {
  gehen_unklar: 'Gehen offen',
  pause_fehlt: 'Pause unter 30 min',
  projektzeit_ueber_arbeitszeit: 'Projektzeit über Arbeitszeit',
};

const Etikett = ({ children, warn }) => (
  <span className="text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] whitespace-nowrap"
    style={warn ? { color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface } : { color: RITTLER.textSecondary, backgroundColor: RITTLER.surface }}>
    {children}
  </span>
);

const Aktion = ({ onClick, icon, title, children }) => (
  <button type="button" onClick={onClick} title={title} aria-label={title}
    className="h-7 px-1.5 rounded border text-[11px] font-semibold flex items-center gap-1 hover:bg-muted"
    style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
    {icon}{children}
  </button>
);

const STIFT = <Pencil className="w-3 h-3" />;
const EIMER = <Trash2 className="w-3 h-3" />;

function Zeile({ z, tag, kannAntrag, antragOffen, onAntrag }) {
  const offen = (id) => antragOffen(id);
  const ic = 'w-4 h-4 shrink-0';
  let icon; let titel; let text = null; let farbe = RITTLER.black; let leise = false; let aktionen = null; let etiketten = [];
  const zeitText = z.zeit ? wienUhr(z.zeit) : '—';

  if (z.typ === 'kommen') {
    icon = <LogIn className={ic} style={{ color: STATUS_COLORS.done }} />;
    titel = 'Gekommen';
    if (z.stempel.quelle === 'antrag') etiketten.push(<Etikett key="a">per Antrag</Etikett>);
    if (kannAntrag && !offen(z.stempel.id)) aktionen = (<>
      <Aktion title="Uhrzeit ändern (Antrag)" icon={STIFT} onClick={() => onAntrag({ typ: 'stempel_aendern', stempel: z.stempel })} />
      <Aktion title="Entfernen (Antrag)" icon={EIMER} onClick={() => onAntrag({ typ: 'stempel_loeschen', stempel: z.stempel })} />
    </>);
    if (offen(z.stempel.id)) etiketten.push(<Etikett key="o" warn>Antrag offen</Etikett>);
  } else if (z.typ === 'gehen') {
    icon = <LogOut className={ic} style={{ color: z.automatisch ? STATUS_COLORS.attention : RITTLER.textSecondary }} />;
    titel = z.automatisch ? 'Automatisch beendet' : 'Gegangen';
    if (z.automatisch) etiketten.push(<Etikett key="g" warn>Gehen offen</Etikett>);
    if (z.stempel.quelle === 'antrag') etiketten.push(<Etikett key="a">per Antrag</Etikett>);
    if (kannAntrag && !z.automatisch && !offen(z.stempel.id)) aktionen = (<>
      <Aktion title="Uhrzeit ändern (Antrag)" icon={STIFT} onClick={() => onAntrag({ typ: 'stempel_aendern', stempel: z.stempel })} />
      <Aktion title="Entfernen (Antrag)" icon={EIMER} onClick={() => onAntrag({ typ: 'stempel_loeschen', stempel: z.stempel })} />
    </>);
    if (offen(z.stempel.id)) etiketten.push(<Etikett key="o" warn>Antrag offen</Etikett>);
  } else if (z.typ === 'pause') {
    icon = <Coffee className={ic} style={{ color: STATUS_COLORS.attention }} />;
    titel = 'Pause';
    text = z.laeuft ? 'läuft' : `bis ${wienUhr(z.bis)} · ${dauer(z.minuten)} h`;
    farbe = RITTLER.textSecondary;
    const st = [z.start, z.ende].filter(Boolean);
    if (kannAntrag && st.length && !st.some((s) => offen(s.id))) aktionen = (<>
      {z.start && <Aktion title="Pausenbeginn ändern (Antrag)" icon={STIFT} onClick={() => onAntrag({ typ: 'stempel_aendern', stempel: z.start })}>Beginn</Aktion>}
      {z.ende && <Aktion title="Pausenende ändern (Antrag)" icon={STIFT} onClick={() => onAntrag({ typ: 'stempel_aendern', stempel: z.ende })}>Ende</Aktion>}
    </>);
    if (st.some((s) => offen(s.id))) etiketten.push(<Etikett key="o" warn>Antrag offen</Etikett>);
  } else if (z.typ === 'arbeit' || z.typ === 'laeuft') {
    const b = z.buchung;
    icon = <Play className={ic} style={{ color: RITTLER.black }} />;
    titel = 'Arbeit begonnen';
    const projekt = b ? [b.kunde, b.projekt].filter(Boolean).join(' · ') : z.timer?.projekt_titel;
    text = (
      <>
        <span className="font-medium" style={{ color: RITTLER.black }}>{projekt || 'Projekt'}</span>
        <span style={{ color: RITTLER.textSecondary }}>
          {z.typ === 'laeuft' ? ' · läuft' : z.ohneUhrzeit ? ` · ${dauer(z.minuten)} h` : ` · bis ${wienUhr(z.bis)} · ${dauer(z.minuten)} h`}
        </span>
        {b?.note && <span className="block text-xs truncate" style={{ color: RITTLER.textSecondary }}>{b.note}</span>}
      </>
    );
    if (b) {
      if (b.quelle && b.quelle !== 'timer') etiketten.push(<Etikett key="n">nachgetragen</Etikett>);
      if (b.source === 'korrigiert') etiketten.push(<Etikett key="k">korrigiert</Etikett>);
      if (b.abrechnungsstatus === 'abgerechnet') etiketten.push(<Etikett key="r">abgerechnet</Etikett>);
      if (offen(b.id)) etiketten.push(<Etikett key="o" warn>Antrag offen</Etikett>);
      if (kannAntrag && !offen(b.id) && b.abrechnungsstatus !== 'abgerechnet' && b.started_at) aktionen = (<>
        <Aktion title="Zeit ändern (Antrag)" icon={STIFT} onClick={() => onAntrag({ typ: 'buchung_aendern', buchung: b })} />
        <Aktion title="Entfernen (Antrag)" icon={EIMER} onClick={() => onAntrag({ typ: 'buchung_loeschen', buchung: b })} />
      </>);
    }
  } else if (z.typ === 'ohne') {
    icon = <Circle className="w-2.5 h-2.5 mx-[3px] shrink-0" style={{ color: RITTLER.line }} />;
    titel = 'Ohne Projekt';
    text = z.offen ? 'seither' : `bis ${wienUhr(z.bis)} · ${dauer(z.minuten)} h`;
    leise = true;
  } else if (z.typ === 'alt') {
    icon = <Circle className="w-2.5 h-2.5 mx-[3px] shrink-0" style={{ color: RITTLER.line }} />;
    titel = artText(z.stempel.art);
    leise = true;
    etiketten.push(<Etikett key="x">{z.stempel.status === 'ungueltig' ? 'doppelt' : 'ersetzt'}</Etikett>);
  }

  return (
    <div className="flex items-start gap-3 px-3 py-2 text-sm" style={leise ? { color: RITTLER.textSecondary } : undefined}>
      <span className={`w-11 shrink-0 tabular-nums font-semibold ${z.typ === 'alt' ? 'line-through' : ''}`} style={{ color: leise ? RITTLER.textSecondary : RITTLER.black }}>{zeitText}</span>
      <span className="pt-0.5">{icon}</span>
      <span className={`flex-1 min-w-0 ${z.typ === 'alt' ? 'line-through' : ''}`}>
        <span className={leise ? '' : 'font-semibold'} style={{ color: leise ? RITTLER.textSecondary : farbe }}>{titel}</span>
        {text && <span>{typeof text === 'string' ? <span style={{ color: RITTLER.textSecondary }}> · {text}</span> : <> · {text}</>}</span>}
      </span>
      <span className="flex items-center gap-1 shrink-0 flex-wrap justify-end">{etiketten}{aktionen}</span>
    </div>
  );
}

export default function TagesListe({ tag, heute, jetztIso, timer, offen, onUmschalten, kannAntrag, antraegeTag, onAntrag }) {
  const antragOffen = (id) => antraegeTag.some((a) => a.ziel_id === id);
  const zeilen = offen ? zeitleiste(tag, { jetztIso, timer: tag.tag === heute ? timer : null }) : [];
  const antrag = (v) => onAntrag({ ...v, tag: tag.tag, wochentag: tag.wochentag });

  return (
    <div className="bg-white rounded border" style={{ borderColor: RITTLER.line }}>
      <button type="button" onClick={onUmschalten} className="w-full flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5 text-left hover:bg-muted/40">
        <span className="text-sm font-bold w-[120px]">{tagKurz(tag.tag, tag.wochentag)}{tag.tag === heute ? ' · heute' : ''}</span>
        <span className="text-sm tabular-nums" style={{ color: RITTLER.textSecondary }}>
          {tag.stempelt && tag.kommen ? <>
            {wienUhr(tag.kommen)}–{tag.zustand !== 'weg' ? 'jetzt' : wienUhr(tag.gehen)}
            {' · '}<b style={{ color: RITTLER.black }}>{dauer(tag.arbeitszeitMin)} h</b> Arbeitszeit · {' '}
          </> : null}
          {dauer(tag.projektzeitMin)} h Projekte
          {tag.stempelt && tag.saldoMin !== null && tag.sollMin > 0 && (
            <span style={{ color: tag.saldoMin < 0 ? STATUS_COLORS.attention : undefined }}> · Saldo {saldo(tag.saldoMin)}</span>
          )}
        </span>
        <span className="flex flex-wrap gap-1 flex-1">
          {tag.feiertag && <Etikett>{tag.feiertag}</Etikett>}
          {tag.abwesend && <Etikett>abwesend</Etikett>}
          {!tag.neu && <Etikett>vor Umstellung</Etikett>}
          {tag.hinweise.map((h) => <Etikett key={h} warn>{HINWEIS[h] || h}</Etikett>)}
          {antraegeTag.length > 0 && <Etikett warn>{antraegeTag.length} Antrag offen</Etikett>}
        </span>
        <span style={{ color: RITTLER.textSecondary }}>{offen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</span>
      </button>

      {offen && (
        <div className="border-t" style={{ borderColor: RITTLER.line }}>
          {zeilen.length === 0 && <p className="px-3 py-3 text-sm" style={{ color: RITTLER.textSecondary }}>Für diesen Tag ist nichts aufgezeichnet.</p>}
          <div className="divide-y" style={{ borderColor: RITTLER.line }}>
            {zeilen.map((z, i) => (
              <Zeile key={`${z.typ}-${z.zeit}-${i}`} z={z} tag={tag} kannAntrag={kannAntrag} antragOffen={antragOffen} onAntrag={antrag} />
            ))}
          </div>
          {kannAntrag && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-t text-xs" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
              <span>Projektzeit entsteht nur über den Timer. Zeit ohne Projekt ist erlaubt.</span>
              {tag.stempelt && (
                <Aktion title="Fehlenden Stempel beantragen" icon={<Plus className="w-3 h-3" />} onClick={() => antrag({ typ: 'stempel_fehlt' })}>
                  Fehlender Stempel
                </Aktion>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
