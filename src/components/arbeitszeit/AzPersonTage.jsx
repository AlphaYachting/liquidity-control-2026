import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ladeAktionen } from '@/lib/arbeitszeit/arbeitszeitDaten';
import { ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { STATUS_COLORS, RITTLER } from '@/components/sprint/sprintConfig';
import { tageDerPerson } from '@/lib/arbeitszeit/tagesDetails';
import { fmtStd } from '@/lib/arbeitszeit/auswertung';
import { fmtDatum, wochentag } from '@/lib/arbeitszeit/kalender';
import AzTagDetail from './AzTagDetail';

const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const STATUS = {
  abgeschlossen: { text: 'abgeschlossen', farbe: STATUS_COLORS.doneText, flaeche: STATUS_COLORS.doneSurface },
  offen: { text: 'offen', farbe: STATUS_COLORS.critical, flaeche: STATUS_COLORS.criticalSurface },
  heute: { text: 'läuft', farbe: STATUS_COLORS.attention, flaeche: STATUS_COLORS.attentionSurface },
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
const uhr = (d) => (d ? d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' }) : '—');

// Beginn bzw. Ende: gebucht gegen tatsächlich im Tool belegt. Rot, wenn die Buchung vor der
// ersten bzw. nach der letzten Aktion liegt (mehr als 5 Minuten).
function Grenze({ zeit, auffaellig, titel }) {
  return (
    <td className={zelle} title={titel} style={{ color: auffaellig ? STATUS_COLORS.critical : undefined, fontWeight: auffaellig ? 600 : undefined }}>
      {uhr(zeit)}
    </td>
  );
}

// Erfasst = alles, was an dem Tag steht. Gebucht = davon vom Timer gemessen.
// Nachgetragen = davon von Hand eingetragen oder länger als der Timer lief.
const SPALTEN = [
  { text: 'Tag' }, { text: 'Status' },
  { text: 'Gebucht ab', titel: 'Beginn der frühesten Buchung des Tages' },
  { text: 'Erste Aktion', titel: 'Frühester belegter Moment im Tool: Tool geöffnet, Timer gestartet, Buchung angelegt oder geändert' },
  { text: 'Gebucht bis', titel: 'Ende der spätesten Buchung des Tages' },
  { text: 'Letzte Aktion', titel: 'Spätester belegter Moment im Tool: Timer gestoppt, Buchung angelegt oder geändert, Tag abgeschlossen' },
  { text: 'Soll' },
  { text: 'Erfasst', titel: 'Alle Buchungen des Tages' },
  { text: 'Gebucht', titel: 'Davon vom Timer gemessen' },
  { text: 'Nachgetragen', titel: 'Davon von Hand eingetragen oder länger als der Timer lief' },
  { text: 'Verrechenbar' }, { text: 'Nicht verr.' }, { text: 'Offene Lücke' }, { text: 'Buchungen' }, { text: 'Hinweise' },
];

// Die Tage einer Person im gewählten Zeitraum, aufklappbar bis zur einzelnen Buchung.
// Öffnet als Seitenpanel über der Seite — sichtbar, egal wo in der Tabelle geklickt wurde.
export default function AzPersonTage({ person, daten, zeitraum, onSchliessen }) {
  // Änderungsprotokoll der Person — erst beim Öffnen geladen, nicht für die ganze Seite
  const { data: aktionen = null } = useQuery({
    queryKey: ['arbeitszeitAktionen', person.email || person.key, zeitraum.von, zeitraum.tageBis || zeitraum.auswertungBis],
    queryFn: () => ladeAktionen(person.email || person.key, zeitraum.von, zeitraum.tageBis || zeitraum.auswertungBis),
    enabled: !String(person.key).startsWith('awork:'),
    staleTime: 2 * 60 * 1000,
  });
  const tage = useMemo(() => tageDerPerson({ ...daten, person, zeitraum, aktionen }), [daten, person, zeitraum, aktionen]);
  // Beim Öffnen ist der erste auffällige Tag aufgeklappt. Die Seite setzt einen key
  // je Person und Zeitraum, damit das Panel dafür neu beginnt.
  const [offen, setOffen] = useState(() => tage.find((t) => t.hinweise.length)?.tag || null);

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
  const summeGemessen = tage.reduce((s, t) => s + (t.gemessen || 0), 0);
  const summeNach = tage.reduce((s, t) => s + (t.nachgetragen || 0), 0);

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onSchliessen(); }}>
      <SheetContent side="right" className="w-full sm:max-w-5xl overflow-y-auto p-0">
      <SheetHeader className="px-5 pt-5 pb-3 pr-12 border-b border-border space-y-1">
        <SheetTitle className="text-section font-bold uppercase tracking-tight">Tage von {person.name}</SheetTitle>
        <SheetDescription className="text-meta">
          {fmtDatum(zeitraum.von)} – {fmtDatum(zeitraum.tageBis || zeitraum.auswertungBis)}{zeitraum.tageBis > zeitraum.auswertungBis ? ' (heute läuft noch)' : ''} · {fmtStd(summe)} h erfasst
          {summeGemessen + summeNach > 0 && <> · davon {fmtStd(summeGemessen)} h gebucht (Timer), {fmtStd(summeNach)} h nachgetragen</>}
          {auffaellig > 0 && <span style={{ color: STATUS_COLORS.critical }}> · {auffaellig} {auffaellig === 1 ? 'Tag' : 'Tage'} mit Auffälligkeiten</span>}
          {' '}· nur lesen, Änderungen macht die Person selbst
        </SheetDescription>
      </SheetHeader>
      {!tage.length ? <p className="p-6 text-center text-muted-foreground">Keine Tage im Zeitraum.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border">
                {SPALTEN.map((s, i) => (
                  <th key={s.text} title={s.titel} className={`text-label uppercase text-muted-foreground font-medium px-3 py-2 whitespace-nowrap ${i < 2 || i === SPALTEN.length - 1 ? 'text-left' : 'text-right'}`}>{s.text}</th>
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
                      {t.grenzen ? (
                        <>
                          <Grenze zeit={t.grenzen.gebuchtAb} auffaellig={t.grenzenGeprueft && t.grenzen.zuFrueh}
                            titel={t.grenzen.zuFrueh ? `${t.grenzen.vorBeginn} min vor der ersten Aktion im Tool gebucht` : undefined} />
                          <Grenze zeit={t.grenzen.ersteAktion} titel={t.grenzen.ersteArt || undefined} />
                          <Grenze zeit={t.grenzen.gebuchtBis} auffaellig={t.grenzenGeprueft && t.grenzen.zuSpaet}
                            titel={t.grenzen.zuSpaet ? `${t.grenzen.nachEnde} min über die letzte Aktion im Tool hinaus gebucht` : undefined} />
                          <Grenze zeit={t.grenzen.letzteAktion} titel={t.grenzen.letzteArt ? `${t.grenzen.letzteArt}${t.grenzenGeprueft ? '' : ' (Protokoll lädt noch)'}` : undefined} />
                        </>
                      ) : (
                        <><td className={zelle}>—</td><td className={zelle}>—</td><td className={zelle}>—</td><td className={zelle}>—</td></>
                      )}
                      <td className={zelle}>{t.soll ? fmtStd(t.soll) : '—'}</td>
                      <td className={`${zelle} font-medium`} style={{ color: ueber || t.hinweise.length ? STATUS_COLORS.critical : undefined }}>{fmtStd(t.gebucht)}</td>
                      <td className={zelle}>{t.gemessen === null ? '—' : fmtStd(t.gemessen)}</td>
                      <td className={zelle} style={{ color: t.nachgetragen > 0 && t.gebucht > 0 && t.nachgetragen / t.gebucht > 0.5 ? STATUS_COLORS.attention : undefined }}>
                        {t.nachgetragen === null ? '—' : fmtStd(t.nachgetragen)}
                      </td>
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
                        <td colSpan={SPALTEN.length} className="px-4 py-4 bg-muted/20">
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
      </SheetContent>
    </Sheet>
  );
}
