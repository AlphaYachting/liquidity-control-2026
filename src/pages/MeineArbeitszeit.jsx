import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Pencil, Trash2, Plus, Check, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import AntragDialog, { artText } from '@/components/arbeitszeit/AntragDialog';
import { ANWESENHEIT_KEY } from '@/lib/arbeitszeit/useAnwesenheit';
import { wienTag, wienUhr, tagKurz, dauer, saldo, monatName, monatPlus } from '@/lib/arbeitszeit/wienZeit';

// „Meine Arbeitszeit“ — die eigene Aufzeichnungsseite (Einsicht nach § 26 AZG).
// Hier wird NICHTS eingetragen. Jede Änderung ist ein Antrag und wirkt erst nach Genehmigung.

const HINWEIS = {
  gehen_unklar: 'Gehen offen',
  pause_fehlt: 'Pause unter 30 min',
  projektzeit_ueber_arbeitszeit: 'Projektzeit über Arbeitszeit',
};
const STATUS_TEXT = { offen: 'offen', genehmigt: 'genehmigt', abgelehnt: 'abgelehnt', zurueckgezogen: 'zurückgezogen' };
const ANTRAG_TEXT = {
  'stempel:aendern': 'Uhrzeit ändern', 'stempel:loeschen': 'Stempel entfernen', 'stempel:nachtragen': 'Fehlender Stempel',
  'stempel:gehen_angeben': 'Gehen angegeben', 'buchung:aendern': 'Projektzeit ändern', 'buchung:loeschen': 'Buchung entfernen',
  'buchung:ende_angeben': 'Timer-Ende angegeben',
};

const Kachel = ({ label, wert, zusatz, farbe }) => (
  <div className="bg-white rounded border p-4" style={{ borderColor: RITTLER.line }}>
    <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: RITTLER.textSecondary }}>{label}</p>
    <p className="text-[22px] font-bold tabular-nums mt-1" style={{ color: farbe || RITTLER.black }}>{wert}</p>
    {zusatz && <p className="text-xs mt-0.5" style={{ color: RITTLER.textSecondary }}>{zusatz}</p>}
  </div>
);

const Etikett = ({ children, warn }) => (
  <span className="text-[10.5px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-[2px] whitespace-nowrap"
    style={warn ? { color: STATUS_COLORS.attention, backgroundColor: STATUS_COLORS.attentionSurface } : { color: RITTLER.textSecondary, backgroundColor: RITTLER.surface }}>
    {children}
  </span>
);

const KleinKnopf = ({ onClick, icon, children, title }) => (
  <button type="button" onClick={onClick} title={title}
    className="h-7 px-2 rounded border text-[11px] font-semibold flex items-center gap-1 hover:bg-muted" style={{ borderColor: RITTLER.line, color: RITTLER.black }}>
    {icon}{children}
  </button>
);

function antragBeschreibung(a) {
  const n = a.nachher || {};
  const v = a.vorher || {};
  if (a.ziel === 'stempel') {
    if (a.art === 'aendern') return `${artText(v.art)} ${wienUhr(v.zeit)} → ${wienUhr(n.zeit)}`;
    if (a.art === 'loeschen') return `${artText(v.art)} ${wienUhr(v.zeit)} entfernen`;
    if (a.art === 'nachtragen') return `${artText(n.art)} ${wienUhr(n.zeit)}`;
    if (a.art === 'gehen_angeben') return `Gehen ${wienUhr(n.zeit)} (automatisch beendet ${wienUhr(v.automatisch_beendet_am)})`;
  }
  if (a.art === 'aendern') return `${wienUhr(v.started_at)}–${wienUhr(v.ended_at)} → ${wienUhr(n.started_at)}–${wienUhr(n.ended_at)}`;
  if (a.art === 'loeschen') return `${wienUhr(v.started_at)}–${wienUhr(v.ended_at)} (${dauer(v.duration_minutes)} h) entfernen`;
  if (a.art === 'ende_angeben') return `${a.projekt || n.projekt_titel || 'Projekt'} ${wienUhr(n.von)}–${wienUhr(n.bis)}`;
  return '';
}

export default function MeineArbeitszeit() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [monat, setMonat] = useState(wienTag().slice(0, 7));
  const [person, setPerson] = useState(null); // nur Genehmiger: andere Person ansehen
  const [offenerTag, setOffenerTag] = useState(null);
  const [vorlage, setVorlage] = useState(null);
  const [auswahl, setAuswahl] = useState([]);
  const [kommentar, setKommentar] = useState('');
  const [entscheidet, setEntscheidet] = useState(false);
  const [meldung, setMeldung] = useState('');

  const key = ['meineArbeitszeit', user?.email, monat, person];
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: key,
    enabled: !!user?.email,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await base44.functions.invoke('arbeitszeit', { aktion: 'monat', monat, ...(person ? { person_email: person } : {}) });
      if (res?.data?.fehler) throw new Error(res.data.fehler);
      return res.data;
    },
  });
  const { data: team = [] } = useQuery({
    queryKey: ['teamFuerArbeitszeit'],
    enabled: !!data?.genehmiger,
    staleTime: 10 * 60 * 1000,
    queryFn: () => base44.entities.TeamMember.filter({ active: true }, 'name', 100),
  });

  const neuLaden = () => {
    qc.invalidateQueries({ queryKey: ['meineArbeitszeit'] });
    qc.invalidateQueries({ queryKey: ANWESENHEIT_KEY(String(user?.email || '').toLowerCase()) });
  };

  const tage = useMemo(() => (data?.tage || []).filter((t) => t.stempel.length || t.buchungen.length || (t.sollMin || 0) > 0 || t.tag === data.heute), [data]);
  const fremd = !!person && person !== String(user?.email || '').toLowerCase();

  const entscheiden = async (entscheidung, ids) => {
    setEntscheidet(true); setMeldung('');
    try {
      const res = await base44.functions.invoke('arbeitszeit', { aktion: 'entscheiden', ids, entscheidung, kommentar });
      const d = res?.data || {};
      if (d.fehler) setMeldung(d.fehler);
      else {
        const fehlerListe = (d.ergebnis || []).filter((x) => x.fehler);
        setMeldung(fehlerListe.length ? `${fehlerListe.length} nicht übernommen: ${fehlerListe.map((x) => x.fehler).join(' · ')}` : '');
        setAuswahl([]); setKommentar('');
      }
    } catch (e) {
      setMeldung(e?.response?.data?.fehler || 'Keine Verbindung — bitte erneut versuchen.');
    } finally {
      setEntscheidet(false);
      neuLaden();
    }
  };

  const zurueckziehen = async (id) => {
    await base44.functions.invoke('arbeitszeit', { aktion: 'zurueckziehen', antrag_id: id }).catch(() => null);
    neuLaden();
  };

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        {isError ? (
          <div className="bg-white rounded border p-6 text-center space-y-2" style={{ borderColor: RITTLER.line }}>
            <p>Die Arbeitszeit konnte nicht geladen werden.</p>
            <button type="button" className="h-9 px-4 rounded border text-xs font-bold uppercase" style={{ borderColor: RITTLER.black }} onClick={() => refetch()}>Erneut versuchen</button>
          </div>
        ) : (<><Skeleton className="h-24 w-full bg-muted" /><Skeleton className="h-96 w-full bg-muted" /></>)}
      </div>
    );
  }

  const s = data.summe;
  const anteil = s.arbeitszeitMin ? Math.round((s.projektzeitMin / s.arbeitszeitMin) * 100) : null;
  const offeneAlle = data.offeneAlle || [];
  const darfAntraege = !fremd;

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold uppercase tracking-tight" style={{ color: RITTLER.black }}>Meine Arbeitszeit</h1>
          <p className="text-sm" style={{ color: RITTLER.textSecondary }}>
            Deine Aufzeichnung aus Kommen, Pause, Gehen und den Projekt-Timern. Änderungen nur per Antrag.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.genehmiger && (
            <select className="h-9 px-2 rounded border text-sm bg-white" style={{ borderColor: RITTLER.line }}
              value={person || ''} onChange={(e) => { setPerson(e.target.value || null); setOffenerTag(null); }}>
              <option value="">Meine Arbeitszeit</option>
              {team.filter((m) => m.email?.toLowerCase() !== user?.email?.toLowerCase()).map((m) => <option key={m.id} value={m.email.toLowerCase()}>{m.name}</option>)}
            </select>
          )}
          <button type="button" aria-label="Monat zurück" onClick={() => setMonat(monatPlus(monat, -1))} className="h-9 w-9 rounded border flex items-center justify-center" style={{ borderColor: RITTLER.line }}><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold w-[130px] text-center">{monatName(monat)}</span>
          <button type="button" aria-label="Monat vor" disabled={monat >= data.heute.slice(0, 7)} onClick={() => setMonat(monatPlus(monat, 1))} className="h-9 w-9 rounded border flex items-center justify-center disabled:opacity-30" style={{ borderColor: RITTLER.line }}><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kachel label="Arbeitszeit" wert={`${dauer(s.arbeitszeitMin)} h`} zusatz={data.stempelt ? 'Kommen bis Gehen, ohne Pausen' : 'stempelt nicht'} />
        <Kachel label="Soll" wert={`${dauer(s.sollMin)} h`} zusatz="ohne Feiertage und Abwesenheit" />
        <Kachel label="Saldo" wert={`${saldo(s.saldoMin)} h`} farbe={s.saldoMin < 0 ? STATUS_COLORS.attention : undefined} zusatz={`bis ${data.monat === data.heute.slice(0, 7) ? 'heute' : 'Monatsende'}`} />
        <Kachel label="Davon auf Projekten" wert={`${dauer(s.projektzeitMin)} h`} zusatz={anteil === null ? '' : `${anteil} % der Arbeitszeit · ohne Projekt ${dauer(s.ohneProjektMin)} h`} />
      </div>

      {darfAntraege && data.zuKlaeren.length > 0 && (
        <div className="rounded p-4 space-y-2" style={{ backgroundColor: STATUS_COLORS.attentionSurface, border: `1.5px solid ${STATUS_COLORS.attention}` }}>
          <p className="text-sm font-bold" style={{ color: STATUS_COLORS.attention }}>Zu klären — hier fehlt deine Angabe</p>
          {data.zuKlaeren.map((e) => (
            <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 bg-white rounded border px-3 py-2" style={{ borderColor: RITTLER.line }}>
              <p className="text-sm">
                <b>{tagKurz(e.tag, '')}</b>{' '}
                {e.art === 'gehen_angeben'
                  ? `Gehen nicht gestempelt — gekommen ${wienUhr(e.vorher?.kommen)}, automatisch beendet ${wienUhr(e.vorher?.automatisch_beendet_am)}.`
                  : `Timer auf ${e.projekt || 'Projekt'} lief seit ${wienUhr(e.nachher?.von)} und wurde automatisch angehalten.`}
              </p>
              <KleinKnopf onClick={() => setVorlage({ typ: e.art, tag: e.tag, wochentag: '', entwurf: e })} icon={<Pencil className="w-3 h-3" />}>
                {e.art === 'gehen_angeben' ? 'Gehen angeben' : 'Ende angeben'}
              </KleinKnopf>
            </div>
          ))}
        </div>
      )}

      {data.genehmiger && !fremd && offeneAlle.length > 0 && (
        <div className="bg-white rounded border" style={{ borderColor: RITTLER.line }}>
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b" style={{ borderColor: RITTLER.line }}>
            <p className="text-[11px] font-bold uppercase tracking-[2px]" style={{ color: RITTLER.textSecondary }}>Anträge zur Genehmigung · {offeneAlle.length}</p>
            <div className="flex items-center gap-2">
              <input value={kommentar} onChange={(e) => setKommentar(e.target.value)} placeholder="Kommentar (bei Ablehnung Pflicht)"
                className="h-8 px-2 rounded border text-xs w-[220px]" style={{ borderColor: RITTLER.line }} />
              <KleinKnopf onClick={() => !entscheidet && auswahl.length && entscheiden('genehmigt', auswahl)} icon={<Check className="w-3 h-3" />}>Genehmigen ({auswahl.length})</KleinKnopf>
              <KleinKnopf onClick={() => !entscheidet && auswahl.length && entscheiden('abgelehnt', auswahl)} icon={<X className="w-3 h-3" />}>Ablehnen</KleinKnopf>
            </div>
          </div>
          {meldung && <p className="px-3 py-2 text-xs font-semibold" style={{ color: STATUS_COLORS.critical }}>{meldung}</p>}
          <div className="divide-y" style={{ borderColor: RITTLER.line }}>
            {offeneAlle.map((a) => (
              <label key={a.id} className="flex items-start gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-muted/40">
                <input type="checkbox" className="mt-1" checked={auswahl.includes(a.id)}
                  onChange={(e) => setAuswahl((l) => (e.target.checked ? [...l, a.id] : l.filter((x) => x !== a.id)))} />
                <div className="flex-1 min-w-0">
                  <p><b>{team.find((m) => m.email?.toLowerCase() === a.person_email)?.name || a.person_email}</b> · {tagKurz(a.tag, '')} · {ANTRAG_TEXT[`${a.ziel}:${a.art}`] || a.art}</p>
                  <p className="text-xs" style={{ color: RITTLER.textSecondary }}>{antragBeschreibung(a)} — „{a.grund}“</p>
                </div>
                <button type="button" className="text-xs underline shrink-0" style={{ color: RITTLER.textSecondary }}
                  onClick={(e) => { e.preventDefault(); setPerson(a.person_email === user?.email?.toLowerCase() ? null : a.person_email); setMonat(a.tag.slice(0, 7)); setOffenerTag(a.tag); }}>
                  Tag ansehen
                </button>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded border" style={{ borderColor: RITTLER.line }}>
        <div className="hidden md:grid grid-cols-[110px_70px_70px_70px_90px_90px_80px_1fr_24px] gap-2 px-3 py-2 border-b text-[11px] font-bold uppercase tracking-wide"
          style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
          <span>Tag</span><span>Kommen</span><span>Gehen</span><span>Pause</span><span>Arbeitszeit</span><span>Projekte</span><span>Saldo</span><span>Hinweis</span><span />
        </div>
        {tage.length === 0 && <p className="p-6 text-center text-sm" style={{ color: RITTLER.textSecondary }}>In diesem Monat ist nichts aufgezeichnet.</p>}
        <div className="divide-y" style={{ borderColor: RITTLER.line }}>
          {tage.map((t) => {
            const auf = offenerTag === t.tag;
            const antraegeTag = data.antraege.filter((a) => a.tag === t.tag && a.status === 'offen');
            const hatAntrag = (id) => antraegeTag.some((a) => a.ziel_id === id);
            const gueltig = t.stempel.filter((x) => x.status === 'gueltig');
            const kannAntrag = darfAntraege && t.neu;
            return (
              <div key={t.tag}>
                <button type="button" onClick={() => setOffenerTag(auf ? null : t.tag)}
                  className="w-full text-left grid grid-cols-[1fr_auto] md:grid-cols-[110px_70px_70px_70px_90px_90px_80px_1fr_24px] gap-2 px-3 py-2.5 text-sm tabular-nums hover:bg-muted/40 items-center">
                  <span className="font-semibold">{tagKurz(t.tag, t.wochentag)}{t.tag === data.heute ? ' · heute' : ''}</span>
                  <span className="hidden md:inline">{t.stempelt ? wienUhr(t.kommen) || '—' : ''}</span>
                  <span className="hidden md:inline">{t.stempelt ? (t.zustand !== 'weg' ? 'läuft' : wienUhr(t.gehen) || '—') : ''}</span>
                  <span className="hidden md:inline">{t.stempelt ? dauer(t.pauseMin) : ''}</span>
                  <span className="hidden md:inline font-semibold">{t.stempelt ? dauer(t.arbeitszeitMin) : ''}</span>
                  <span className="hidden md:inline">{dauer(t.projektzeitMin)}</span>
                  <span className="hidden md:inline" style={{ color: (t.saldoMin || 0) < 0 ? STATUS_COLORS.attention : undefined }}>{t.stempelt ? saldo(t.saldoMin) : ''}</span>
                  <span className="hidden md:flex flex-wrap gap-1">
                    {t.feiertag && <Etikett>{t.feiertag}</Etikett>}
                    {t.abwesend && <Etikett>abwesend</Etikett>}
                    {!t.neu && <Etikett>vor Umstellung</Etikett>}
                    {t.hinweise.map((h) => <Etikett key={h} warn>{HINWEIS[h] || h}</Etikett>)}
                    {antraegeTag.length > 0 && <Etikett warn>{antraegeTag.length} Antrag offen</Etikett>}
                  </span>
                  <span className="flex justify-end md:justify-start items-center gap-2" style={{ color: RITTLER.textSecondary }}>
                    <span className="md:hidden text-xs">{t.stempelt ? `${dauer(t.arbeitszeitMin)} h · ` : ''}{dauer(t.projektzeitMin)} h Projekt</span>
                    {auf ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </span>
                </button>

                {auf && (
                  <div className="px-3 pb-3 grid gap-3 md:grid-cols-2" style={{ backgroundColor: 'hsl(var(--muted) / 0.35)' }}>
                    {t.stempelt && (
                      <div className="pt-3">
                        <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: RITTLER.textSecondary }}>Anwesenheit</p>
                        <div className="bg-white rounded border divide-y" style={{ borderColor: RITTLER.line }}>
                          {t.stempel.length === 0 && <p className="px-3 py-2 text-sm" style={{ color: RITTLER.textSecondary }}>Keine Stempel.</p>}
                          {t.stempel.map((st) => (
                            <div key={st.id} className="flex items-center gap-3 px-3 py-2 text-sm" style={st.status !== 'gueltig' ? { color: RITTLER.textSecondary } : undefined}>
                              <span className={`w-12 tabular-nums font-semibold ${st.status !== 'gueltig' ? 'line-through' : ''}`}>{wienUhr(st.zeit)}</span>
                              <span className={`flex-1 ${st.status !== 'gueltig' ? 'line-through' : ''}`}>{artText(st.art)}</span>
                              {st.quelle === 'auto' && <Etikett warn>automatisch</Etikett>}
                              {st.quelle === 'antrag' && <Etikett>per Antrag</Etikett>}
                              {st.quelle === 'admin' && <Etikett>korrigiert</Etikett>}
                              {st.status === 'storniert' && <Etikett>ersetzt</Etikett>}
                              {st.status === 'ungueltig' && <Etikett>doppelt</Etikett>}
                              {kannAntrag && st.status === 'gueltig' && st.quelle !== 'auto' && !hatAntrag(st.id) && (
                                <>
                                  <KleinKnopf title="Uhrzeit ändern (Antrag)" onClick={() => setVorlage({ typ: 'stempel_aendern', tag: t.tag, wochentag: t.wochentag, stempel: st })} icon={<Pencil className="w-3 h-3" />} />
                                  <KleinKnopf title="Stempel entfernen (Antrag)" onClick={() => setVorlage({ typ: 'stempel_loeschen', tag: t.tag, wochentag: t.wochentag, stempel: st })} icon={<Trash2 className="w-3 h-3" />} />
                                </>
                              )}
                              {hatAntrag(st.id) && <Etikett warn>Antrag offen</Etikett>}
                            </div>
                          ))}
                        </div>
                        {kannAntrag && t.tag <= data.heute && (
                          <div className="mt-1.5">
                            <KleinKnopf onClick={() => setVorlage({ typ: 'stempel_fehlt', tag: t.tag, wochentag: t.wochentag })} icon={<Plus className="w-3 h-3" />}>Fehlenden Stempel beantragen</KleinKnopf>
                          </div>
                        )}
                        {gueltig.length > 0 && (
                          <p className="text-xs mt-1.5" style={{ color: RITTLER.textSecondary }}>
                            Arbeitszeit {dauer(t.arbeitszeitMin)} h · Pause {dauer(t.pauseMin)} h · davon ohne Projekt {dauer(t.ohneProjektMin)} h
                          </p>
                        )}
                      </div>
                    )}
                    <div className="pt-3">
                      <p className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: RITTLER.textSecondary }}>Projektzeit</p>
                      <div className="bg-white rounded border divide-y" style={{ borderColor: RITTLER.line }}>
                        {t.buchungen.length === 0 && <p className="px-3 py-2 text-sm" style={{ color: RITTLER.textSecondary }}>Keine Projektzeit.</p>}
                        {t.buchungen.map((b) => (
                          <div key={b.id} className="flex items-start gap-3 px-3 py-2 text-sm">
                            <span className="w-[86px] shrink-0 tabular-nums">
                              <span className="font-semibold">{b.started_at ? `${wienUhr(b.started_at)}–${wienUhr(b.ended_at)}` : '—'}</span>
                              <span className="block text-xs" style={{ color: RITTLER.textSecondary }}>{dauer(b.duration_minutes)} h</span>
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block truncate font-medium">{[b.kunde, b.projekt].filter(Boolean).join(' · ') || 'Projekt'}</span>
                              {b.note && <span className="block text-xs truncate" style={{ color: RITTLER.textSecondary }}>{b.note}</span>}
                            </span>
                            <span className="flex items-center gap-1 shrink-0">
                              {b.quelle !== 'timer' && <Etikett>nachgetragen</Etikett>}
                              {b.source === 'korrigiert' && <Etikett>korrigiert</Etikett>}
                              {b.abrechnungsstatus === 'abgerechnet' && <Etikett>abgerechnet</Etikett>}
                              {hatAntrag(b.id) && <Etikett warn>Antrag offen</Etikett>}
                              {kannAntrag && !hatAntrag(b.id) && b.abrechnungsstatus !== 'abgerechnet' && b.started_at && (
                                <>
                                  <KleinKnopf title="Zeit ändern (Antrag)" onClick={() => setVorlage({ typ: 'buchung_aendern', tag: t.tag, wochentag: t.wochentag, buchung: b })} icon={<Pencil className="w-3 h-3" />} />
                                  <KleinKnopf title="Buchung entfernen (Antrag)" onClick={() => setVorlage({ typ: 'buchung_loeschen', tag: t.tag, wochentag: t.wochentag, buchung: b })} icon={<Trash2 className="w-3 h-3" />} />
                                </>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs mt-1.5" style={{ color: RITTLER.textSecondary }}>
                        Projektzeit entsteht nur über den Timer. Lücken sind erlaubt — sie zählen als Arbeitszeit ohne Projekt.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {data.antraege.length > 0 && (
        <div className="bg-white rounded border" style={{ borderColor: RITTLER.line }}>
          <p className="px-3 py-2 border-b text-[11px] font-bold uppercase tracking-[2px]" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>
            {fremd ? 'Anträge' : 'Meine Anträge'}
          </p>
          <div className="divide-y" style={{ borderColor: RITTLER.line }}>
            {data.antraege.slice(0, 50).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                <span className="w-[90px] font-semibold tabular-nums">{tagKurz(a.tag, '')}</span>
                <span className="flex-1 min-w-[200px]">
                  {ANTRAG_TEXT[`${a.ziel}:${a.art}`] || a.art} · {antragBeschreibung(a)}
                  <span className="block text-xs" style={{ color: RITTLER.textSecondary }}>
                    „{a.grund}“{a.kommentar ? ` — Antwort: ${a.kommentar}` : ''}
                  </span>
                </span>
                <Etikett warn={a.status === 'offen' || a.status === 'abgelehnt'}>{STATUS_TEXT[a.status] || a.status}</Etikett>
                {!fremd && a.status === 'offen' && (
                  <button type="button" className="text-xs underline" style={{ color: RITTLER.textSecondary }} onClick={() => zurueckziehen(a.id)}>Zurückziehen</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <AntragDialog vorlage={vorlage} onClose={() => setVorlage(null)} onGestellt={neuLaden} />
    </div>
  );
}
