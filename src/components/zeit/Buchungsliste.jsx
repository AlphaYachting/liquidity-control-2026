import React from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import BuchungZeile from './BuchungZeile';
import { regelnFuer } from '@/lib/zeit/rundung';
import { minuteVonIso, uhr, dauerText } from '@/lib/zeit/tagesAuswertung';

// Jede Buchung des Tages als Zeile — Korrekturen stehen unter ihrem Original.
// Mit Anwesenheitserfassung (Pilot oder ab Stichtag) stehen Kommen, Pause und Gehen als schmale
// Zeilen dazwischen, nach Uhrzeit einsortiert. Die Buchungszeilen selbst bleiben unverändert.
// Stempel ändert man nur per Antrag (Stift / Papierkorb öffnen den Antrag).

const zeitVon = (iso) => (iso ? uhr(minuteVonIso(iso)) : '');

// Kommen, Pause (Beginn + Ende in einer Zeile), Gehen aus den gültigen Stempeln des Tages
function anwesenheitsZeilen(stempel = []) {
  const gueltig = stempel.filter((s) => (s.status || 'gueltig') === 'gueltig').sort((a, b) => a.zeit.localeCompare(b.zeit));
  const zeilen = [];
  let pause = null;
  for (const s of gueltig) {
    if (s.art === 'kommen') zeilen.push({ typ: 'kommen', zeit: s.zeit, stempel: [s] });
    else if (s.art === 'pause_start') pause = s;
    else if (s.art === 'pause_ende') { zeilen.push({ typ: 'pause', zeit: pause ? pause.zeit : s.zeit, bis: s.zeit, stempel: [pause, s].filter(Boolean) }); pause = null; }
    else if (s.art === 'gehen') {
      if (pause) { zeilen.push({ typ: 'pause', zeit: pause.zeit, bis: s.zeit, stempel: [pause] }); pause = null; }
      zeilen.push({ typ: 'gehen', zeit: s.zeit, stempel: [s], automatisch: s.quelle === 'auto' });
    }
  }
  if (pause) zeilen.push({ typ: 'pause', zeit: pause.zeit, bis: null, stempel: [pause] });
  return zeilen;
}

const FARBE = { kommen: STATUS_COLORS.done, pause: STATUS_COLORS.attention, gehen: RITTLER.textSecondary };

function AnwesenheitsZeile({ z, offenFuer, kannAntrag, onAntrag }) {
  const offen = z.stempel.some((s) => offenFuer.has(s.id));
  const text = z.typ === 'kommen' ? 'Gekommen'
    : z.typ === 'pause' ? `Pause${z.bis ? ` bis ${zeitVon(z.bis)} · ${dauerText((Date.parse(z.bis) - Date.parse(z.zeit)) / 60000)}` : ' läuft'}`
      : z.automatisch ? 'Gehen nicht gestempelt — automatisch beendet' : 'Gegangen';
  const quelleAntrag = z.stempel.some((s) => s.quelle === 'antrag');
  return (
    <div className="flex items-center gap-3 px-3 py-1.5" style={{ backgroundColor: 'hsl(var(--muted) / 0.45)' }}>
      <span className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: FARBE[z.typ] }} />
      <span className="w-[150px] shrink-0 text-sm font-semibold tabular-nums" style={{ color: RITTLER.black }}>{zeitVon(z.zeit)}</span>
      <span className="flex-1 min-w-0 text-sm font-semibold" style={{ color: z.automatisch ? STATUS_COLORS.attention : RITTLER.black }}>{text}</span>
      {quelleAntrag && (
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px]" style={{ color: RITTLER.textSecondary, backgroundColor: RITTLER.surface }}>per Antrag</span>
      )}
      {offen && (
        <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px]" style={{ color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }}>Antrag offen</span>
      )}
      {kannAntrag && !offen && !z.automatisch && (
        <span className="flex items-center gap-0.5 shrink-0">
          {z.stempel.map((s) => (
            <button key={s.id} type="button" onClick={() => onAntrag({ typ: 'stempel_aendern', stempel: s })}
              aria-label="Uhrzeit ändern (Antrag)" title={z.typ === 'pause' ? (s.art === 'pause_start' ? 'Pausenbeginn ändern (Antrag)' : 'Pausenende ändern (Antrag)') : 'Uhrzeit ändern (Antrag)'}
              className="p-1.5 rounded hover:bg-muted flex items-center gap-1 text-[10px]" style={{ color: RITTLER.textSecondary }}>
              <Pencil className="w-3.5 h-3.5" />{z.typ === 'pause' ? (s.art === 'pause_start' ? 'Beginn' : 'Ende') : ''}
            </button>
          ))}
          {z.typ !== 'pause' && (
            <button type="button" onClick={() => onAntrag({ typ: 'stempel_loeschen', stempel: z.stempel[0] })}
              aria-label="Entfernen (Antrag)" title="Entfernen (Antrag)" className="p-1.5 rounded hover:bg-muted">
              <Trash2 className="w-3.5 h-3.5" style={{ color: RITTLER.textSecondary }} />
            </button>
          )}
        </span>
      )}
    </div>
  );
}

export default function Buchungsliste({
  auswertung, eintraege, projektLabel, gesperrt, projekteById = {}, settings = {}, onAendern, onLoeschen, onGeaendert,
  anwesenheit = null, antragOffenFuer = new Set(), kannStempelAntrag = false, onStempelAntrag,
}) {
  const regelnVon = (e) => regelnFuer(projekteById[e.project_id], settings);
  const ueberschneidend = new Set(auswertung.blocks.filter((b) => b.ueberschneidet).map((b) => b.entry.id));
  const anw = anwesenheit ? anwesenheitsZeilen(anwesenheit) : [];

  if (!eintraege.length && !anw.length) {
    return (
      <p className="p-8 text-center text-sm bg-white rounded border" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
        Für diesen Tag ist nichts erfasst.
      </p>
    );
  }

  const korrekturen = eintraege.filter((e) => e.korrektur_zu);
  const korrekturenZu = korrekturen.reduce((acc, k) => {
    (acc[k.korrektur_zu] = acc[k.korrektur_zu] || []).push(k);
    return acc;
  }, {});
  const originale = eintraege.filter((e) => !e.korrektur_zu);

  // Eine Liste nach Uhrzeit: Buchungen und Anwesenheit gemischt. Buchungen ohne Zeitfenster ans Ende.
  const RANG = { kommen: 0, buchung: 1, pause: 2, gehen: 3 };
  const zeilen = [
    ...originale.map((e) => ({ typ: 'buchung', zeit: e.started_at || null, e })),
    ...anw,
  ].sort((a, b) => {
    if (!a.zeit && !b.zeit) return 0;
    if (!a.zeit) return 1;
    if (!b.zeit) return -1;
    return a.zeit.localeCompare(b.zeit) || RANG[a.typ] - RANG[b.typ];
  });

  return (
    <div className="bg-white rounded border divide-y" style={{ borderColor: RITTLER.line }}>
      {zeilen.map((z, i) => (z.typ === 'buchung' ? (
        <React.Fragment key={z.e.id}>
          <BuchungZeile
            eintrag={z.e}
            label={projektLabel(z.e)}
            ueberschneidet={ueberschneidend.has(z.e.id)}
            gesperrt={gesperrt}
            korrigiert={!!korrekturenZu[z.e.id]}
            regeln={regelnVon(z.e)}
            onAendern={onAendern}
            onLoeschen={onLoeschen}
            onGeaendert={onGeaendert}
          />
          {(korrekturenZu[z.e.id] || []).map((k) => (
            <BuchungZeile key={k.id} eintrag={k} label={projektLabel(k)} istKorrektur gesperrt />
          ))}
        </React.Fragment>
      ) : (
        <AnwesenheitsZeile key={`a${i}-${z.zeit}`} z={z} offenFuer={antragOffenFuer} kannAntrag={kannStempelAntrag} onAntrag={onStempelAntrag} />
      )))}
      {kannStempelAntrag && anwesenheit && (
        <div className="px-3 py-1.5 flex justify-end">
          <button type="button" onClick={() => onStempelAntrag({ typ: 'stempel_fehlt' })}
            className="text-xs flex items-center gap-1 underline" style={{ color: RITTLER.textSecondary }}>
            <Plus className="w-3 h-3" /> Kommen oder Gehen vergessen? Antrag stellen
          </button>
        </div>
      )}
    </div>
  );
}
