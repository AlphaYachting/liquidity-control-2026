import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { RITTLER, STATUS_COLORS, fmtDate } from '@/components/sprint/sprintConfig';
import { usePosteingang } from '@/hooks/usePosteingang';
import { useOffeneTage } from '@/lib/zeit/useOffeneTage';
import { Titel } from '@/components/sprint/heute/MeinTagBausteine';

const KARTE = 'bg-white rounded-lg shadow-sm p-5';
const fmtH = (v) => new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(v || 0);

// Zeit heute: gebucht gegen Tagessoll, dazu der Hinweis auf nicht abgeschlossene Tage.
export function MeinTagZeit({ email, entries = [], standardHours = 8, projectTitleById = {} }) {
  const [offen, setOffen] = useState(false);
  const { offeneTage, aeltester } = useOffeneTage(email);
  const summe = entries.reduce((s, e) => s + (e.hours || 0), 0);
  const anteil = standardHours > 0 ? Math.min(100, (summe / standardHours) * 100) : 0;
  const Icon = offen ? ChevronDown : ChevronRight;

  return (
    <div className={KARTE}>
      <Titel className="mb-2">Zeit heute</Titel>
      <p className="text-2xl font-extrabold tabular-nums" style={{ color: RITTLER.black }}>
        {fmtH(summe)} h
        <span className="text-sm font-medium ml-1.5" style={{ color: RITTLER.textSecondary }}>von {fmtH(standardHours)} h gebucht</span>
      </p>
      <div className="mt-2.5 h-1.5 rounded-[3px] overflow-hidden" style={{ backgroundColor: RITTLER.line }}>
        <div className="h-full rounded-[3px]" style={{ width: `${anteil}%`, backgroundColor: RITTLER.black }} />
      </div>

      {entries.length === 0 ? (
        <p className="text-xs mt-2.5" style={{ color: RITTLER.textSecondary }}>
          Noch nichts gebucht. Der Timer startet direkt an der Aufgabe.
        </p>
      ) : (
        <>
          <button type="button" onClick={() => setOffen((o) => !o)} className="flex items-center gap-1.5 mt-2.5 text-xs font-semibold" style={{ color: RITTLER.black }}>
            <Icon className="w-3.5 h-3.5" />
            {entries.length} {entries.length === 1 ? 'Buchung' : 'Buchungen'}
          </button>
          {offen && (
            <div className="mt-2 space-y-1">
              {entries.map((e) => (
                <div key={e.id} className="flex items-baseline gap-2 text-[13px]">
                  <span className="font-medium truncate" style={{ color: RITTLER.black }}>{projectTitleById[e.project_id] || 'Projekt'}</span>
                  <span className="shrink-0" style={{ color: RITTLER.textSecondary }}>{fmtH(e.hours)} h</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {aeltester && (
        <Link
          to="/zeiten"
          className="block mt-3 p-2.5 rounded text-xs font-semibold hover:underline"
          style={{ color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface }}
        >
          {offeneTage.length === 1 ? '1 Tag ist' : `${offeneTage.length} Tage sind`} noch nicht abgeschlossen
          {' '}(ältester: {fmtDate(aeltester.tag).slice(0, 6)}) — jetzt abschließen
        </Link>
      )}
    </div>
  );
}

const wartezeit = (ms) => {
  const std = Math.max(0, Math.round((Date.now() - ms) / 3600000));
  if (std < 24) return `seit ${std} Std.`;
  const tage = Math.round(std / 24);
  return `seit ${tage} ${tage === 1 ? 'Tag' : 'Tagen'}`;
};

// Unbeantwortete Post: Führung und Projektleitung sehen den ganzen Posteingang, die Webentwicklung den Support-Eingang.
export function MeinTagEingang({ nurSupport }) {
  const post = usePosteingang();
  if (post.isLoading || post.isError) return null;
  const liste = post.eintraege
    .filter((e) => e.sichtbar && (nurSupport ? e.klasse === 'support' : e.klasse !== 'verwaltung'))
    .sort((a, b) => a.eingang - b.eingang);
  const ziel = nurSupport ? '/crm/inbox?filter=support' : '/crm/inbox';
  const titel = nurSupport ? 'Support-Eingang' : 'Posteingang';

  return (
    <div className={KARTE}>
      <Titel className="mb-1">{titel} ({liste.length})</Titel>
      {liste.length === 0 ? (
        <p className="text-xs" style={{ color: RITTLER.textSecondary }}>Nichts Unbeantwortetes.</p>
      ) : (
        <>
          <p className="text-xs mb-1" style={{ color: RITTLER.textSecondary }}>Unbeantwortet — die ältesten zuerst.</p>
          {liste.slice(0, 3).map((e) => (
            <Link key={e.key} to={ziel} className="block py-2 px-2 -mx-2 rounded border-b border-border last:border-0 hover:bg-muted">
              <span className="block text-sm font-medium truncate" style={{ color: RITTLER.black }}>{e.betreff || '(ohne Betreff)'}</span>
              <span className="block text-xs truncate" style={{ color: RITTLER.textSecondary }}>
                {e.absenderName || e.absender}
                <span className="font-bold" style={{ color: e.ueberfaellig ? STATUS_COLORS.critical : RITTLER.textSecondary }}>
                  {' '}· {wartezeit(e.eingang)}
                </span>
              </span>
            </Link>
          ))}
        </>
      )}
      <Link to={ziel} className="inline-block mt-2 text-xs font-semibold underline" style={{ color: RITTLER.black }}>
        Zum {titel}
      </Link>
    </div>
  );
}
