import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';
import { RITTLER, todayIso } from '@/components/sprint/sprintConfig';
import { loescheZeit } from '@/lib/sprint/useTimer';
import Erfassungszeile from '@/components/zeit/Erfassungszeile';
import Wochenstreifen from '@/components/zeit/Wochenstreifen';
import Tagesstreifen from '@/components/zeit/Tagesstreifen';
import Tagesbilanz from '@/components/zeit/Tagesbilanz';
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

// Die eigenen Zeiten: Woche im Rückblick, Erfassung, Tagesstreifen, Bilanz, Buchungen.
export default function Zeiten() {
  const { user } = useAuth();
  const email = user?.email;
  const qc = useQueryClient();
  const [tag, setTag] = useState(todayIso());
  const [vorbelegung, setVorbelegung] = useState(null);
  const [bearbeiten, setBearbeiten] = useState(null);
  const [jetzt, setJetzt] = useState(new Date());
  const { toast } = useToast();
  const { offeneTage, aeltester } = useOffeneTage(email);
  const gesprungen = useRef(false);

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

  const tage = useMemo(() => wochentage(tag), [tag]);

  const { data, isLoading } = useQuery({
    queryKey: ['zeitenSeite', email, tage[0]],
    enabled: !!email,
    queryFn: async () => {
      const [eintraege, abschluesse, vorschlaege, projects, clients, focusDays, members] = await Promise.all([
        base44.entities.TimeEntry.filter({ person_email: email }, '-entry_date', 500),
        base44.entities.Tagesabschluss.filter({ person_email: email }, '-tag', 60),
        base44.entities.Zeitvorschlag.filter({ person_email: email, status: 'offen' }, '-von', 100),
        base44.entities.Project.list('title', 500),
        base44.entities.Client.list('name', 500),
        base44.entities.FocusDay.filter({ person_email: email }, '-day', 200),
        base44.entities.TeamMember.filter({ email }, 'name', 1),
      ]);
      const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
      const projektInfo = Object.fromEntries(projects.map((p) => [p.id, {
        titel: p.title,
        kunde: clientById[p.client_id]?.name || '',
        kuerzel: (p.kuerzel || clientById[p.client_id]?.name || p.title).slice(0, 5).toUpperCase(),
      }]));
      return {
        eintraege, abschluesse, vorschlaege, projektInfo, focusDays,
        rolle: members[0]?.system_role || 'teammitglied',
      };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['zeitenSeite'] });
    qc.invalidateQueries({ queryKey: ['offeneTage'] });
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

  const { eintraege, abschluesse, vorschlaege, projektInfo, focusDays, rolle } = data;
  const istHeute = tag === todayIso();
  const darfFremdOeffnen = rolle === 'pm' || rolle === 'gf';

  // Neue Zeit nur am ältesten offenen Tag — die Ansicht springt dorthin und sagt warum.
  const pruefeTag = (zielTag) => {
    if (!aeltester || zielTag === aeltester.tag) return true;
    setTag(aeltester.tag);
    toast({
      description: `${aeltester.tag.slice(8, 10)}.${aeltester.tag.slice(5, 7)}. ist noch offen (${aeltester.offenMinuten > 0 ? `${dauerText(aeltester.offenMinuten)} fehlen` : 'nichts erfasst'}) — bis zum Abschluss dieses Tages wird keine neue Zeit gebucht.`,
    });
    return false;
  };
  const jetztMinute = jetzt.getHours() * 60 + jetzt.getMinutes();
  const pausenVon = (t) => abschluesse.find((a) => a.tag === t)?.pausen || [];

  const wochenTage = tage.map((t) => ({
    ...werteTagAus({
      tag: t,
      eintraege: eintraege.filter((e) => e.entry_date === t),
      pausen: pausenVon(t),
      istHeute: t === todayIso(),
      jetztMinute,
    }),
    istHeute: t === todayIso(),
    istZukunft: t > todayIso(),
    abgeschlossen: !!abschluesse.find((a) => a.tag === t)?.bestaetigt_am,
    grund: abschluesse.find((a) => a.tag === t)?.grund,
  }));

  const tagesEintraege = eintraege
    .filter((e) => e.entry_date === tag)
    .sort((a, b) => (a.started_at || '').localeCompare(b.started_at || ''));
  const auswertung = werteTagAus({ tag, eintraege: tagesEintraege, pausen: pausenVon(tag), istHeute, jetztMinute });
  const abschluss = abschluesse.find((a) => a.tag === tag);
  const gesperrt = !!abschluss?.bestaetigt_am;
  const wocheBestaetigt = !!abschluesse.find((a) => a.tag === tage[0])?.woche_bestaetigt_am;

  const projektLabel = (e) => {
    const info = projektInfo[e.project_id];
    return {
      kuerzel: info?.kuerzel || '—',
      voll: info ? [info.kunde, info.titel].filter(Boolean).join(' · ') : 'Projekt unbekannt',
    };
  };

  const pauseVermerken = async (loch) => {
    const neu = { von: uhr(loch.von), bis: uhr(loch.bis) };
    if (abschluss) {
      await base44.entities.Tagesabschluss.update(abschluss.id, { pausen: [...(abschluss.pausen || []), neu] });
    } else {
      await base44.entities.Tagesabschluss.create({ person_email: email, tag, pausen: [neu], tagesnorm_minuten: 480 });
    }
    refresh();
  };

  const loeschen = async (e) => {
    if (!window.confirm('Diese Buchung löschen?')) return;
    await loescheZeit(e.id);
    refresh();
  };

  return (
    <div className="max-w-[1200px] mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight" style={{ color: RITTLER.black }}>Zeiten</h1>
        <p className="text-sm" style={{ color: RITTLER.textSecondary }}>{user?.full_name || email}</p>
      </div>

      <OffeneTageHinweis
        offeneTage={offeneTage}
        aeltester={aeltester}
        gewaehlt={tag}
        onWaehlen={setTag}
      />

      <Wochenstreifen
        tage={wochenTage}
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
        onPause={pauseVermerken}
      />

      <Tagesbilanz auswertung={auswertung} />

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
        onAendern={setBearbeiten}
        onLoeschen={loeschen}
        onGeaendert={refresh}
      />

      <TagAbschliessen
        auswertung={auswertung}
        abschluss={abschluss}
        email={email}
        tag={tag}
        wocheBestaetigt={wocheBestaetigt}
        darfFremdOeffnen={darfFremdOeffnen}
        onSaved={refresh}
      />

      <WocheBestaetigen
        tage={tage}
        abschluesse={abschluesse}
        eintraege={eintraege}
        projektLabel={projektLabel}
        email={email}
        onSaved={refresh}
      />

      <BuchungBearbeitenDialog
        eintrag={bearbeiten}
        open={!!bearbeiten}
        onOpenChange={(o) => !o && setBearbeiten(null)}
        onSaved={refresh}
      />
    </div>
  );
}