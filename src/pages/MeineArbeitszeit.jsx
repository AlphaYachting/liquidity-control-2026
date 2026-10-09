import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Pencil, Check, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import AntragDialog, { artText } from '@/components/arbeitszeit/AntragDialog';
import { ANWESENHEIT_KEY, useAnwesenheit } from '@/lib/arbeitszeit/useAnwesenheit';
import TagesListe from '@/components/arbeitszeit/TagesListe';
import { wienTag, wienUhr, tagKurz, dauer, saldo, monatName, monatPlus } from '@/lib/arbeitszeit/wienZeit';

// „Meine Zeiten“ im neuen Modus — die eigene Aufzeichnung (Einsicht nach § 26 AZG): je Tag EINE Liste
// nach Uhrzeit (Kommen, Arbeit begonnen, Pause, Gehen). Wird von pages/Zeiten.jsx im neuen Modus gezeigt.
// Hier wird NICHTS eingetragen. Jede Änderung ist ein Antrag und wirkt erst nach Genehmigung.

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
  const anwesenheit = useAnwesenheit(user?.email);
  const [monat, setMonat] = useState(wienTag().slice(0, 7));
  const [person, setPerson] = useState(null); // nur Genehmiger: andere Person ansehen
  const [offeneTage, setOffeneTage] = useState(() => [wienTag()]); // heute ist aufgeklappt
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
          <h1 className="text-2xl font-extrabold uppercase tracking-tight" style={{ color: RITTLER.black }}>Meine Zeiten</h1>
          <p className="text-sm" style={{ color: RITTLER.textSecondary }}>
            Dein Tag in einer Liste: Kommen, Arbeit, Pause, Gehen. Änderungen nur per Antrag.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {data.genehmiger && (
            <select className="h-9 px-2 rounded border text-sm bg-white" style={{ borderColor: RITTLER.line }}
              value={person || ''} onChange={(e) => { setPerson(e.target.value || null); }}>
              <option value="">Meine Zeiten</option>
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
                  onClick={(e) => { e.preventDefault(); setPerson(a.person_email === user?.email?.toLowerCase() ? null : a.person_email); setMonat(a.tag.slice(0, 7)); setOffeneTage([a.tag]); }}>
                  Tag ansehen
                </button>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {tage.length === 0 && (
          <p className="bg-white rounded border p-6 text-center text-sm" style={{ borderColor: RITTLER.line, color: RITTLER.textSecondary }}>In diesem Monat ist nichts aufgezeichnet.</p>
        )}
        {tage.map((t) => (
          <TagesListe
            key={t.tag}
            tag={t}
            heute={data.heute}
            jetztIso={data.jetzt}
            timer={fremd ? null : anwesenheit.stand?.timer}
            offen={offeneTage.includes(t.tag)}
            onUmschalten={() => setOffeneTage((l) => (l.includes(t.tag) ? l.filter((x) => x !== t.tag) : [...l, t.tag]))}
            kannAntrag={darfAntraege && t.neu}
            antraegeTag={data.antraege.filter((a) => a.tag === t.tag && a.status === 'offen')}
            onAntrag={setVorlage}
          />
        ))}
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
