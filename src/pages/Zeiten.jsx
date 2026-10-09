import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ladeStammdaten, ladeEigeneBuchungen, ladeEigeneAbschluesse, ladeEigeneAbwesenheiten } from '@/lib/zeit/zeitDaten';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { RITTLER, todayIso } from '@/components/sprint/sprintConfig';
import { loescheZeit, useTimer } from '@/lib/sprint/useTimer';
import Erfassungszeile from '@/components/zeit/Erfassungszeile';
import Wochenstreifen from '@/components/zeit/Wochenstreifen';
import Tagesstreifen from '@/components/zeit/Tagesstreifen';
import Tagesbilanz from '@/components/zeit/Tagesbilanz';
import RundungsZeile from '@/components/zeit/RundungsZeile';
import { verrechneteMinutenGesamt } from '@/lib/zeit/rundung';
import { useRundungsSettings } from '@/lib/zeit/useRundungsregeln';
import TaetigkeitBalken from '@/components/zeit/TaetigkeitBalken';
import Buchungsliste from '@/components/zeit/Buchungsliste';
import Vorschlagsliste from '@/components/zeit/Vorschlagsliste';
import BuchungBearbeitenDialog from '@/components/zeit/BuchungBearbeitenDialog';
import TagAbschliessen from '@/components/zeit/TagAbschliessen';
import WocheBestaetigen from '@/components/zeit/WocheBestaetigen';
import OffeneTageHinweis from '@/components/zeit/OffeneTageHinweis';
import { useToast } from '@/components/ui/use-toast';
import { useOffeneTage } from '@/lib/zeit/useOffeneTage';
import { istAbwesend } from '@/lib/zeit/offeneTage';
import { werteTagAus, wochentage, verschiebeTage, uhr, dauerText } from '@/lib/zeit/tagesAuswertung';
import { fehlendeBeschreibungen } from '@/lib/zeit/beschreibungPflicht';
import { ladeArbeitstage, beginnJeTag } from '@/lib/zeit/arbeitstag';
import { minuteVonIso } from '@/lib/zeit/tagesAuswertung';
import { useArbeitszeitAktiv, ANWESENHEIT_KEY } from '@/lib/arbeitszeit/useAnwesenheit';
import { useAnwesenheitWoche, anwesenheitTag, ANWESENHEIT_WOCHE_KEY } from '@/lib/arbeitszeit/anwesenheitWoche';
import AnwesenheitsAntraege from '@/components/arbeitszeit/AnwesenheitsAntraege';
import StempelAntragDialog from '@/components/arbeitszeit/StempelAntragDialog';

// Die eigenen Zeiten: Woche im Rückblick, Erfassung, Tagesstreifen, Bilanz, Buchungen.
// Anwesenheitserfassung (Pilot oder ab Stichtag, Entscheidung Alfons 09.10.2026): Die Seite bleibt wie sie ist;
// dazu kommen Kommen/Pause/Gehen in Buchungsliste und Zeitleiste, die Arbeitszeit in Bilanz und Wochenkacheln,
// und der Tag lässt sich erst abschließen, wenn Gehen gestempelt ist. Stempel ändert man nur per Antrag.
export default function Zeiten() {
  const { user } = useAuth();
  const email = user?.email;
  const qc = useQueryClient();
  const [tag, setTag] = useState(todayIso());
  const [vorbelegung, setVorbelegung] = useState(null);
  const [bearbeiten, setBearbeiten] = useState(null);
  const [jetzt, setJetzt] = useState(new Date());
  const { toast } = useToast();
  const { offeneTage, aeltester, darfBuchen, pflichtAb } = useOffeneTage(email);
  // Nur der laufende Eintrag wird gebraucht — kein Sekundentakt für die ganze Seite.
  const { timer } = useTimer(email, { ticken: false });
  const rundungsSettings = useRundungsSettings();
  const gesprungen = useRef(false);
  const neu = useArbeitszeitAktiv(email);
  const [stempelAntrag, setStempelAntrag] = useState(null);

  // Die Seite öffnet auf dem ältesten offenen Tag, nicht auf heute.
  useEffect(() => {
    if (gesprungen.current || !aeltester) return;
    gesprungen.current = true;
    setTag(aeltester.tag);
  }, [aeltester]);

  useEffect(() => {
    const i = setInterval(() => setJetzt(new Date()), 60000);
    return () => clearInterval(i);
  }, []);

  // Ein Sperrhinweis führt mit Tag und Ziel hierher — die Seite springt dorthin
  // und rollt zur Abschlussleiste.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const zielTag = params.get('tag');
    if (!zielTag) return;
    gesprungen.current = true;
    setTag(zielTag);
    if (params.get('abschluss')) {
      setTimeout(() => document.getElementById('tag-abschluss')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 400);
    }
  }, []);

  const zumAbschluss = (zielTag) => {
    setTag(zielTag);
    setTimeout(() => document.getElementById('tag-abschluss')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  };

  const tage = useMemo(() => wochentage(tag), [tag]);
  const { data: anwWoche, refetch: anwNeuLaden } = useAnwesenheitWoche(email, tage, neu);

  const { data, isLoading } = useQuery({
    queryKey: ['zeitenSeite', email, tage[0]],
    enabled: !!email,
    placeholderData: (vorher) => vorher,
    queryFn: async () => {
      const [eintraege, abschluesse, vorschlaege, { projects, clients }, focusDays, members, arbeitstage] = await Promise.all([
        ladeEigeneBuchungen(email),
        ladeEigeneAbschluesse(email),
        base44.entities.Zeitvorschlag.filter({ person_email: email, status: 'offen' }, '-von', 100),
        ladeStammdaten(),
        ladeEigeneAbwesenheiten(email),
        base44.entities.TeamMember.filter({ email }, 'name', 1),
        ladeArbeitstage(email, tage[0], tage[tage.length - 1]),
      ]);
      const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
      const projekteById = Object.fromEntries(projects.map((p) => [p.id, p]));
      const projektInfo = Object.fromEntries(projects.map((p) => [p.id, {
        titel: p.title,
        kunde: clientById[p.client_id]?.name || '',
        kuerzel: (p.kuerzel || clientById[p.client_id]?.name || p.title).slice(0, 5).toUpperCase(),
      }]));
      return {
        eintraege, abschluesse, vorschlaege, projektInfo, projekteById, focusDays,
        beginnVon: beginnJeTag(arbeitstage),
        rolle: members[0]?.system_role || 'teammitglied',
      };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['zeitenSeite'] });
    qc.invalidateQueries({ queryKey: ['offeneTage'] });
    qc.invalidateQueries({ queryKey: ANWESENHEIT_WOCHE_KEY });
    qc.invalidateQueries({ queryKey: ANWESENHEIT_KEY(String(email || '').toLowerCase()) });
  };

  // Geplante Abwesenheit schließt den Tag von selbst — er gilt nie als offen.
  useEffect(() => {
    if (!data || !email) return;
    const fehlende = tage
      .filter((t) => t < todayIso() && istAbwesend(data.focusDays, t))
      .filter((t) => !data.abschluesse.some((a) => a.tag === t && a.bestaetigt_am));
    if (!fehlende.length) return;
    (async () => {
      for (const t of fehlende) {
        const vorhanden = data.abschluesse.find((a) => a.tag === t);
        const daten = { grund: 'abwesend', bestaetigt_am: new Date().toISOString(), bestaetigt_von: email };
        if (vorhanden) await base44.entities.Tagesabschluss.update(vorhanden.id, daten);
        else await base44.entities.Tagesabschluss.create({ person_email: email, tag: t, tagesnorm_minuten: 0, ...daten });
      }
      qc.invalidateQueries({ queryKey: ['zeitenSeite'] });
      qc.invalidateQueries({ queryKey: ['offeneTage'] });
    })();
  }, [data, email, tage, qc]);

  if (isLoading || !data) {
    return (
      <div className="max-w-[1200px] mx-auto space-y-4">
        <Skeleton className="h-24 w-full bg-muted" />
        <Skeleton className="h-64 w-full bg-muted" />
      </div>
    );
  }

  const { eintraege, abschluesse, vorschlaege, projektInfo, projekteById, focusDays, rolle, beginnVon = {} } = data;
  const istHeute = tag === todayIso();
  const darfFremdOeffnen = rolle === 'pm' || rolle === 'gf';

  // Eine Buchung IN den offenen Tag bleibt immer erlaubt — sonst ließe er sich nie
  // schließen. Gesperrt ist nur ein anderer Zieltag; der Weg hinaus steht dabei.
  const pruefeTag = (zielTag) => {
    if (darfBuchen(zielTag)) return true;
    zumAbschluss(aeltester.tag);
    toast({
      description: `${aeltester.tag.slice(8, 10)}.${aeltester.tag.slice(5, 7)}. ist noch offen (${aeltester.offenMinuten > 0 ? `${dauerText(aeltester.offenMinuten)} fehlen` : 'nichts erfasst'}) — dort buchen und abschließen, dann geht es weiter.`,
    });
    return false;
  };
  const jetztMinute = jetzt.getHours() * 60 + jetzt.getMinutes();
  // Anwesenheit je Tag (null = nicht gestempelt oder alter Modus). Mit Kommen beginnt der Tag beim Kommen,
  // nicht beim ersten Öffnen des Tools.
  const anwVon = (t) => (neu && anwWoche ? anwesenheitTag(anwWoche.stempel, t, jetzt.toISOString()) : null);
  const beginnFuer = (t) => {
    const k = anwVon(t)?.kommen;
    return k ? minuteVonIso(k) : (beginnVon[t] ?? null);
  };

  const wochenTage = tage.map((t) => ({
    ...werteTagAus({
      tag: t,
      eintraege: eintraege.filter((e) => e.entry_date === t),
      tagesbeginnMinute: beginnFuer(t),
      istHeute: t === todayIso(),
      jetztMinute,
      abgeschlossen: !!abschluesse.find((a) => a.tag === t)?.bestaetigt_am,
    }),
    istHeute: t === todayIso(),
    istZukunft: t > todayIso(),
    ...(neu ? { arbeitszeitMin: anwVon(t)?.arbeitszeitMin ?? 0 } : {}),
    abgeschlossen: !!abschluesse.find((a) => a.tag === t)?.bestaetigt_am,
    grund: abschluesse.find((a) => a.tag === t)?.grund,
  }));

  const tagesEintraege = eintraege
    .filter((e) => e.entry_date === tag)
    .sort((a, b) => (a.started_at || '').localeCompare(b.started_at || ''));
  const auswertung = werteTagAus({
    tag, eintraege: tagesEintraege, istHeute, jetztMinute, tagesbeginnMinute: beginnFuer(tag),
    abgeschlossen: !!abschluesse.find((a) => a.tag === tag)?.bestaetigt_am,
  });
  const abschluss = abschluesse.find((a) => a.tag === tag);
  const gesperrt = !!abschluss?.bestaetigt_am;
  const wocheBestaetigt = !!abschluesse.find((a) => a.tag === tage[0])?.woche_bestaetigt_am;
  const anwHeute = anwVon(tag);
  const eigeneAntraege = anwWoche?.antraege?.eigene || [];
  const antragOffenFuer = new Set(eigeneAntraege.filter((a) => a.status === 'offen' && a.ziel_id).map((a) => a.ziel_id));
  // Tag abschließen erst nach Gehen. Ein automatisch beendetes Gehen ist geklärt, sobald der Antrag gestellt ist.
  const gehenAntragGestellt = eigeneAntraege.some((a) => a.tag === tag && a.art === 'gehen_angeben' && a.status === 'offen');
  const gehenHinweis = !anwHeute ? null
    : anwHeute.zustand !== 'weg' ? 'Erst Gehen stempeln, dann den Tag abschließen.'
      : anwHeute.gehenUnklar && !gehenAntragGestellt ? 'Gehen wurde nicht gestempelt — oben unter „Zu klären“ die Uhrzeit angeben, dann abschließen.'
        : null;

  const projektLabel = (e) => {
    const info = projektInfo[e.project_id];
    return {
      kuerzel: info?.kuerzel || '—',
      voll: info ? [info.kunde, info.titel].filter(Boolean).join(' · ') : 'Projekt unbekannt',
    };
  };

  const loeschen = async (e) => {
    if (!window.confirm('Diese Buchung löschen?')) return;
    await loescheZeit(e.id);
    refresh();
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight" style={{ color: RITTLER.black }}>Meine Zeiten</h1>
        <p className="text-sm" style={{ color: RITTLER.textSecondary }}>{user?.full_name || email}</p>
      </div>

      <OffeneTageHinweis
        offeneTage={offeneTage}
        aeltester={aeltester}
        gewaehlt={tag}
        laufendesProjekt={timer?.projekt_titel || null}
        onAbschluss={zumAbschluss}
      />

      {neu && (
        <AnwesenheitsAntraege
          antraege={anwWoche?.antraege}
          onAusfuellen={setStempelAntrag}
          onGeaendert={() => { anwNeuLaden(); refresh(); }}
        />
      )}

      <Wochenstreifen
        tage={wochenTage}
        pflichtAb={pflichtAb}
        gewaehlt={tag}
        onWaehlen={setTag}
        onZurueck={() => setTag(verschiebeTage(tage[0], -7))}
        onVor={() => setTag(verschiebeTage(tage[0], 7))}
      />

      <div className="bg-white rounded border" style={{ borderColor: RITTLER.line }}>
        {tag > todayIso() ? (
          <p className="p-5 text-sm" style={{ color: RITTLER.textSecondary }}>
            Dieser Tag ist noch nicht dran — hier lässt sich erst ab dem Tag selbst erfassen.
          </p>
        ) : (
          <Erfassungszeile
            email={email}
            tag={tag}
            pruefen={pruefeTag}
            vorbelegung={vorbelegung}
            onBooked={() => { setVorbelegung(null); refresh(); }}
          />
        )}
      </div>

      <Tagesstreifen
        auswertung={auswertung}
        kuerzelVon={(e) => projektLabel(e).kuerzel}
        istHeute={istHeute}
        jetztMinute={jetztMinute}
        onLoch={(l) => setVorbelegung({ wert: `${uhr(l.von)}-${uhr(l.bis)}`, n: Date.now() })}
        anwesenheit={anwHeute}
      />
      {anwHeute?.kommen ? (
        <p className="-mt-2 text-xs" style={{ color: RITTLER.textSecondary }}>
          Gekommen um {uhr(minuteVonIso(anwHeute.kommen))}
          {anwHeute.gehen && anwHeute.zustand === 'weg' ? ` · gegangen um ${uhr(minuteVonIso(anwHeute.gehen))}` : ''} — ab hier zählen die Lücken.
        </p>
      ) : auswertung.tagesbeginn !== null && (
        <p className="-mt-2 text-xs" style={{ color: RITTLER.textSecondary }}>
          Tool geöffnet um {uhr(auswertung.tagesbeginn)} — ab hier zählen die Lücken.
        </p>
      )}

      <Tagesbilanz auswertung={auswertung} anwesenheit={anwHeute} mitArbeitszeit={neu} />

      <RundungsZeile werte={verrechneteMinutenGesamt(tagesEintraege, projekteById, rundungsSettings)} titel="Tag" />

      {tagesEintraege.length > 0 && (
        <div className="bg-white rounded border p-4" style={{ borderColor: RITTLER.line }}>
          <TaetigkeitBalken eintraege={tagesEintraege} titel="Tätigkeit am Tag" />
        </div>
      )}

      <Vorschlagsliste
        vorschlaege={vorschlaege.filter((v) => v.day === tag)}
        email={email}
        projektLabel={projektLabel}
        pruefen={pruefeTag}
        onErledigt={refresh}
      />

      <Buchungsliste
        auswertung={auswertung}
        eintraege={tagesEintraege}
        projektLabel={projektLabel}
        gesperrt={gesperrt}
        projekteById={projekteById}
        settings={rundungsSettings}
        onAendern={setBearbeiten}
        onLoeschen={loeschen}
        onGeaendert={refresh}
        anwesenheit={neu ? (anwHeute?.stempel || []) : null}
        antragOffenFuer={antragOffenFuer}
        kannStempelAntrag={neu && tag <= todayIso()}
        onStempelAntrag={(v) => setStempelAntrag({ ...v, tag })}
      />

      <div id="tag-abschluss">
      {tag < pflichtAb ? (
        <p className="py-2 text-sm" style={{ color: RITTLER.textSecondary }}>
          Für Tage vor dem {pflichtAb.slice(8, 10)}.{pflichtAb.slice(5, 7)}.{pflichtAb.slice(0, 4)} ist kein Abschluss nötig.
        </p>
      ) : (
        <TagAbschliessen
          auswertung={auswertung}
          abschluss={abschluss}
          email={email}
          tag={tag}
          wocheBestaetigt={wocheBestaetigt}
          darfFremdOeffnen={darfFremdOeffnen}
          ohneBeschreibung={gesperrt ? [] : fehlendeBeschreibungen(tagesEintraege, projekteById)}
          projektLabel={projektLabel}
          onSaved={refresh}
          gekommen={!!anwHeute?.kommen}
          gehenHinweis={gehenHinweis}
        />
      )}
      </div>

      <WocheBestaetigen
        tage={tage}
        abschluesse={abschluesse}
        eintraege={eintraege}
        projektLabel={projektLabel}
        email={email}
        projekteById={projekteById}
        settings={rundungsSettings}
        onSaved={refresh}
      />

      {stempelAntrag && (
        <StempelAntragDialog vorlage={stempelAntrag} onClose={() => setStempelAntrag(null)} onGestellt={() => { anwNeuLaden(); refresh(); }} />
      )}

      <BuchungBearbeitenDialog
        eintrag={bearbeiten}
        projekt={bearbeiten ? projekteById?.[bearbeiten.project_id] : null}
        open={!!bearbeiten}
        onOpenChange={(o) => !o && setBearbeiten(null)}
        onSaved={refresh}
      />
    </div>
  );
}