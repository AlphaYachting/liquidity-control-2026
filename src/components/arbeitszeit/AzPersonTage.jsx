import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
import { STATUS_COLORS, RITTLER } from '@/components/sprint/sprintConfig';
import { tageDerPerson } from '@/lib/arbeitszeit/tagesDetails';
import { fmtStd } from '@/lib/arbeitszeit/auswertung';
import { fmtDatum, wochentag } from '@/lib/arbeitszeit/kalender';
import AzTagDetail from './AzTagDetail';

const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const STATUS = {
  abgeschlossen: { text: 'abgeschlossen', farbe: STATUS_COLORS.doneText, flaeche: STATUS_COLORS.doneSurface },
  offen: { text: 'offen', farbe: STATUS_COLORS.critical, flaeche: STATUS_COLORS.criticalSurface },
  abwesend: { text: 'abwesend', farbe: RITTLER.textSecondary, flaeche: RITTLER.surface },
  feiertag: { text: 'Feiertag', farbe: RITTLER.textSecondary, flaeche: RITTLER.surface },
  wochenende: { text: 'Wochenende', farbe: RITTLER.textSecondary, flaeche: RITTLER.surface },
};

function Status({ tag }) {
  const s = tag.quelle === 'awork' && tag.status === 'normal'
    ? { text: 'aWork', farbe: RITTLER.textSecondary, flaeche: RITTLER.surface }
    : STATUS[tag.status];
  if (!s) return null;
  return (
    <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] whitespace-nowrap"
      style={{ color: s.farbe, backgroundColor: s.flaeche }} title={tag.feiertag || undefined}>
      {s.text}
    </span>
  );
}

const zelle = 'px-3 py-2 text-right tabular-nums whitespace-nowrap';

// Die Tage einer Person im gewählten Zeitraum, aufklappbar bis zur einzelnen Buchung.
export default function AzPersonTage({ person, daten, zeitraum, onSchliessen }) {
  const kopf = useRef(null);
  const tage = useMemo(() => tageDerPerson({ ...daten, person, zeitraum }), [daten, person, zeitraum]);
  // Beim Öffnen ist der erste auffällige Tag aufgeklappt. Die Seite setzt einen key
  // je Person und Zeitraum, damit das Panel dafür neu beginnt.
  const [offen, setOffen] = useState(() => tage.find((t) => t.hinweise.length)?.tag || null);
  useEffect(() => { kopf.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, []);

  const projektInfo = useMemo(() => {
    const kunde = Object.fromEntries((daten.clients || []).map((c) => [c.id, c.name]));
    return Object.fromEntries((daten.projects || []).map((p) => {
      const k = kunde[p.client_id] || '';
      return [p.id, { voll: [k, p.title].filter(Boolean).join(' · ') || 'Projekt', kuerzel: (p.kuerzel || k || p.title || '—').slice(0, 5).toUpperCase() }];
    }));
  }, [daten.projects, daten.clients]);
  const projektVonAwork = useMemo(() => Object.fromEntries((daten.projects || []).filter((p) => p.awork_project_id).map((p) => [p.awork_project_id, p.id])), [daten.projects]);
  const aworkLabel = (b) => projektInfo[projektVonAwork[b.awork_project_id]]?.voll || b.project_name || 'aWork-Projekt';

  const auffaellig = tage.filter((t) => t.hinweise.length).length;
  const summe = tage.reduce((s, t) => s + t.gebucht, 0);

  return (
    <div ref={kopf} className="bg-white rounded border border-border scroll-mt-4">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 border-b border-border">
        <div>
          <h2 className="text-section font-bold uppercase tracking-tight">Tage von {person.name}</h2>
          <p className="text-meta text-muted-foreground">
            {fmtDatum(zeitraum.von)} – {fmtDatum(zeitraum.auswertungBis)} · {fmtStd(summe)} h gebucht
            {auffaellig > 0 && <span style={{ color: STATUS_COLORS.critical }}> · {auffaellig} {auffaellig === 1 ? 'Tag' : 'Tage'} mit Auffälligkeiten</span>}
            {' '}· nur lesen, Änderungen macht die Person selbst
          </p>
        </div>
        <button type="button" onClick={onSchliessen} className="p-1.5 rounded hover:bg-muted" aria-label="Tagesansicht schließen">
          <X className="w-4 h-4" />
        </button>
      </div>
      {!tage.length ? <p className="p-6 text-center text-muted-foreground">Keine Tage im Zeitraum.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border">
                {['Tag', 'Status', 'Soll', 'Gebucht', 'Verrechenbar', 'Nicht verr.', 'Offene Lücke', 'Buchungen', 'Hinweise'].map((s, i) => (
                  <th key={s} className={`text-label uppercase text-muted-foreground font-medium px-3 py-2 whitespace-nowrap ${i < 2 || i === 8 ? 'text-left' : 'text-right'}`}>{s}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tage.map((t) => {
                const auf = offen === t.tag;
                const ueber = t.soll > 0 && t.gebucht > t.soll + 120;
                return (
                  <React.Fragment key={t.tag}>
                    <tr className={`border-b border-border cursor-pointer hover:bg-muted/50 ${auf ? 'bg-muted/40' : ''}`}
                      onClick={() => setOffen(auf ? null : t.tag)} aria-expanded={auf}>
                      <td className="px-3 py-2 whitespace-nowrap font-medium">
                        <span className="inline-flex items-center gap-1">
                          {auf ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {WT[wochentag(t.tag)]} {fmtDatum(t.tag).slice(0, 6)}
                        </span>
                      </td>
                      <td className="px-3 py-2"><Status tag={t} /></td>
                      <td className={zelle}>{t.soll ? fmtStd(t.soll) : '—'}</td>
                      <td className={`${zelle} font-medium`} style={{ color: ueber || t.hinweise.length ? STATUS_COLORS.critical : undefined }}>{fmtStd(t.gebucht)}</td>
                      <td className={zelle}>{fmtStd(t.verr)}</td>
                      <td className={zelle}>{fmtStd(t.nv)}</td>
                      <td className={zelle}>{t.quelle === 'app' && t.offenMinuten ? fmtStd(t.offenMinuten) : '—'}</td>
                      <td className={zelle}>{t.anzahl || '–'}</td>
                      <td className="px-3 py-2 text-meta" style={{ color: STATUS_COLORS.critical }}>
                        {t.hinweise.length > 0 && (
                          <span className="inline-flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{t.hinweise.join(' · ')}</span>
                        )}
                      </td>
                    </tr>
                    {auf && (
                      <tr className="border-b border-border">
                        <td colSpan={9} className="px-4 py-4 bg-muted/20">
                          <AzTagDetail tag={t} projektInfo={projektInfo} aworkLabel={aworkLabel} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
