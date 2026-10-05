import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { todayIso } from '@/components/sprint/sprintConfig';
import { ermittleBuchungsfelder, ueberKontingentPruefen, sperreDurchsetzen, kontingentGesperrt, sperrMeldung } from './buchungsfelder';
import { vorbelegeTaetigkeit } from '@/lib/zeit/taetigkeit';
import { vorbelegeBereich } from '@/lib/zeit/leistungsbereich';

const KEY = 'sprint_timer_cache';
const MAX_MINUTEN = 600; // 10 Stunden

// localStorage ist nur Zwischenspeicher für die Anzeige — Quelle ist immer die Datenbank.
const cacheRead = (email) => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    return raw && raw.person_email === email ? raw : undefined;
  } catch {
    return undefined;
  }
};
const cacheWrite = (timer) => {
  if (timer) localStorage.setItem(KEY, JSON.stringify({ ...timer, cache_stand: Date.now() }));
  else localStorage.removeItem(KEY);
};
// Der Zwischenspeicher darf einen gelöschten Timer nicht wiederbeleben: älter als
// eine Minute wird er ignoriert und der Serverstand abgewartet.
const cacheFrisch = (email) => {
  const t = cacheRead(email);
  return t && Date.now() - (Number(t.cache_stand) || 0) < 60000 ? t : undefined;
};

const minutenSeit = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

// Keine Rundung beim Erfassen — die Verrechnungsrundung lebt in src/lib/zeit/rundung.js.
export const stundenAus = (minuten) => Math.round((minuten / 60) * 100) / 100;
export const zeitLabel = (minuten) => `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')}`;

// Tag im lokalen Kalender — ein Timer von 23:30 bis 00:30 gehört auf den Starttag.
export const tagVon = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const kuerzelOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

// Je Person darf es nur EINE laufende Zeile geben: die jüngste gilt, der Rest wird entfernt.
const laufendeVon = async (email) => {
  const rows = await base44.entities.LaufendeZeitbuchung.filter({ person_email: email }, '-gestartet_am', 50);
  for (const alt of rows.slice(1)) {
    await base44.entities.LaufendeZeitbuchung.delete(alt.id).catch(() => null);
  }
  return rows[0] || null;
};

// Ist der Tag dieser Person bereits festgeschrieben?
export async function tagBestaetigt(email, tag) {
  const rows = await base44.entities.Tagesabschluss.filter({ person_email: email, tag }, '-tag', 1);
  return !!rows[0]?.bestaetigt_am;
}

// Eine Buchung anlegen — die volle Minutenzahl wird gespeichert, hours daraus abgeleitet.
export async function bucheZeit({
  projectId, email, durationMinutes, note = '', entryDate,
  startedAt, endedAt, taetigkeit, verrechenbar, nichtVerrechenbarGrund,
  ueberKontingent, quelle = 'timer', korrekturZu, ticketId, ausCrm, moduleTemplateId, mehrleistung, trotzdem,
}) {
  const felder = await ermittleBuchungsfelder(projectId);
  const minuten = Math.round(Number(durationMinutes) || 0);
  const tag = entryDate || todayIso();
  // Tätigkeit: die Vorbelegung greift immer, eine ausdrückliche Wahl hat Vorrang.
  const art = taetigkeit || (await vorbelegeTaetigkeit({
    kategorie: felder.kategorie,
    ticketId,
    nichtVerrechenbarGrund,
    ausCrm,
  }));
  // Buchungssperre bei verbrauchtem Kontingent (nur wenn am Projekt eingeschaltet)
  const trotzSperre = await sperreDurchsetzen({ projectId, tag, minuten, trotzdem });
  // Support über dem Monatskontingent wird als Mehrleistung gekennzeichnet.
  const ueber = trotzSperre ? true : ueberKontingent !== undefined
    ? ueberKontingent
    : minuten > 0
      ? await ueberKontingentPruefen({ projectId, tag, minuten })
      : false;
  return base44.entities.TimeEntry.create({
    ...felder,
    ...(verrechenbar === undefined ? {} : { verrechenbar, abrechenbar: verrechenbar }),
    ...(nichtVerrechenbarGrund ? { nicht_verrechenbar_grund: nichtVerrechenbarGrund } : {}),
    ...(art ? { taetigkeit: art } : {}),
    ...(ticketId ? { ticket_id: ticketId } : {}),
    ...(moduleTemplateId ? { module_template_id: moduleTemplateId } : {}),
    ...(korrekturZu ? { korrektur_zu: korrekturZu } : {}),
    ...(mehrleistung ? { mehrleistung: true } : {}),
    person_email: email,
    entry_date: tag,
    started_at: startedAt,
    ended_at: endedAt,
    duration_minutes: minuten,
    hours: stundenAus(minuten),
    ueber_kontingent: !!ueber,
    quelle,
    note,
    source: quelle === 'korrektur' ? 'korrigiert' : 'bestaetigt',
  });
}

// Ändern der eigenen Buchung. Ist der Tag bestätigt, entsteht eine Korrekturbuchung.
export async function aendereZeit(id, patch = {}) {
  const original = await base44.entities.TimeEntry.get(id);
  const daten = { ...patch };

  if (daten.duration_minutes !== undefined) {
    daten.duration_minutes = Math.round(Number(daten.duration_minutes) || 0);
    daten.hours = stundenAus(daten.duration_minutes);
  }
  if (daten.verrechenbar !== undefined) daten.abrechenbar = daten.verrechenbar;

  if (await tagBestaetigt(original.person_email, original.entry_date)) {
    const neueMinuten = daten.duration_minutes ?? original.duration_minutes ?? 0;
    const differenz = neueMinuten - (Number(original.duration_minutes) || 0);
    return bucheZeit({
      projectId: daten.project_id || original.project_id,
      email: original.person_email,
      durationMinutes: differenz,
      entryDate: original.entry_date,
      startedAt: daten.started_at || original.started_at,
      endedAt: daten.ended_at || original.ended_at,
      note: daten.note ?? `Korrektur zu ${original.entry_date}`,
      taetigkeit: daten.taetigkeit || original.taetigkeit,
      verrechenbar: daten.verrechenbar ?? original.verrechenbar,
      moduleTemplateId: daten.module_template_id !== undefined ? daten.module_template_id : original.module_template_id,
      quelle: 'korrektur',
      korrekturZu: original.id,
    });
  }

  const geaendert = (daten.duration_minutes !== undefined && daten.duration_minutes !== original.duration_minutes)
    || (daten.project_id && daten.project_id !== original.project_id)
    || (daten.entry_date && daten.entry_date !== original.entry_date);
  if (geaendert) {
    const pruef = {
      projectId: daten.project_id || original.project_id,
      tag: daten.entry_date || original.entry_date,
      minuten: daten.duration_minutes ?? original.duration_minutes,
      ohneId: id,
    };
    // Admins ändern trotz Sperre (markiert), alle anderen werden abgewiesen.
    const trotzSperre = await sperreDurchsetzen({ ...pruef, trotzdem: true });
    daten.ueber_kontingent = trotzSperre || await ueberKontingentPruefen(pruef);
  }
  // Nachträglich geänderte Zeiten kennzeichnen: eine gestoppte Timer-Buchung, deren
  // Beginn, Ende oder Dauer von Hand geändert wird, ist nicht mehr gemessen.
  // Unsichtbar für die Bedienung — dient nur der Nachvollziehbarkeit.
  const zeitGeaendert = (daten.started_at && daten.started_at !== original.started_at)
    || (daten.ended_at && daten.ended_at !== original.ended_at)
    || (daten.duration_minutes !== undefined && daten.duration_minutes !== original.duration_minutes);
  if (zeitGeaendert) daten.source = 'korrigiert';
  return base44.entities.TimeEntry.update(id, daten);
}

// Löschen der eigenen Buchung. Ist der Tag bestätigt, wird die Dauer per Korrektur ausgeglichen.
export async function loescheZeit(id) {
  const original = await base44.entities.TimeEntry.get(id);
  if (await tagBestaetigt(original.person_email, original.entry_date)) {
    return bucheZeit({
      projectId: original.project_id,
      email: original.person_email,
      durationMinutes: -(Number(original.duration_minutes) || 0),
      entryDate: original.entry_date,
      note: `Storno zu ${original.entry_date}`,
      verrechenbar: original.verrechenbar,
      quelle: 'korrektur',
      korrekturZu: original.id,
    });
  }
  return base44.entities.TimeEntry.delete(id);
}

// Optionen: ticken=false schaltet den Sekundentakt ab (wenn nur `timer` gebraucht wird);
// nurTicketId=<id> lässt nur dann ticken, wenn der Timer genau auf dieser Aufgabe läuft
// (sonst zeichnet jede Aufgabenzeile in „Mein Tag“ jede Sekunde neu).
export function useTimer(email, { ticken = true, nurTicketId } = {}) {
  const qc = useQueryClient();
  const [, setTick] = useState(0);

  const { data: timer } = useQuery({
    queryKey: ['laufendeZeitbuchung', email],
    enabled: !!email,
    initialData: () => cacheFrisch(email),
    queryFn: async () => {
      const t = await laufendeVon(email);
      cacheWrite(t);
      return t;
    },
  });

  const running = !!timer;
  const elapsedMinutes = running ? minutenSeit(timer.gestartet_am) : 0;

  const tickenAktiv = running && ticken && (!nurTicketId || timer?.ticket_id === nurTicketId);
  useEffect(() => {
    if (!tickenAktiv) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [tickenAktiv]);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['laufendeZeitbuchung', email] }), [qc, email]);

  // Das Stoppen läuft serverseitig in einem wiederholbaren Aufruf. Pausenminuten
  // werden von der gemessenen Dauer abgezogen. Scheitert es, läuft der Timer weiter.
  const stop = useCallback(async (note = '', abzugMinuten = 0) => {
    const aktuell = await laufendeVon(email);
    if (!aktuell) {
      await refresh();
      return null;
    }
    try {
      const res = await base44.functions.invoke('zeitStoppen', {
        laufende_id: aktuell.id,
        notiz: note,
        abzug_minuten: Number(abzugMinuten) || 0,
        entry_date: tagVon(aktuell.gestartet_am),
      });
      const daten = res?.data || {};
      if (daten.fehler || !daten.erfolg) throw new Error(daten.fehler || 'Buchung nicht gespeichert');

      // Sofort und ohne Neuladen: ein Neuladen könnte die gelöschte Zeile noch liefern.
      cacheWrite(null);
      qc.setQueryData(['laufendeZeitbuchung', email], null);
      return {
        hours: daten.stunden,
        minuten: daten.minuten,
        projekt: daten.projekt_titel || aktuell.projekt_titel,
        eintragId: daten.time_entry?.id,
        projectId: aktuell.project_id,
        ticketId: aktuell.ticket_id,
        datum: daten.entry_date || tagVon(aktuell.gestartet_am),
      };
    } catch (e) {
      // Nichts wurde gelöscht — die gemessene Zeit ist erhalten.
      return {
        fehler: e?.response?.data?.fehler || e.message || 'Buchung nicht gespeichert',
        minuten: Math.max(0, minutenSeit(aktuell.gestartet_am) - (Number(abzugMinuten) || 0)),
        projekt: aktuell.projekt_titel,
        projectId: aktuell.project_id,
      };
    }
  }, [email, refresh, qc]);

  // Je Person läuft genau ein Timer — ein zweiter Start braucht die ausdrückliche Bestätigung.
  const start = useCallback(async (project, kuerzel, notiz = '', { force = false, ticketId, moduleTemplateId } = {}) => {
    const bestehend = await laufendeVon(email);
    if (bestehend && !force) return { conflict: bestehend };
    // Kontingent im laufenden Monat schon voll verbraucht und gesperrt: kein Start (außer Admin)
    const sperre = await kontingentGesperrt({ projectId: project.id, tag: todayIso(), minuten: 1 });
    if (sperre.gesperrt) {
      const me = await base44.auth.me().catch(() => null);
      if (me?.role !== 'admin') return { fehler: await sperrMeldung(sperre) };
    }
    if (bestehend) {
      const res = await stop();
      // Nicht gebucht heißt nicht umschalten — sonst geht die gemessene Zeit verloren.
      if (res?.fehler) return { fehler: res.fehler };
    }
    // Eindeutigkeit erzwingen: etwaige Reste derselben Person entfernen.
    const reste = await base44.entities.LaufendeZeitbuchung.filter({ person_email: email }, '-gestartet_am', 50);
    for (const alt of reste) await base44.entities.LaufendeZeitbuchung.delete(alt.id).catch(() => null);

    const felder = await ermittleBuchungsfelder(project.id);
    const bereich = moduleTemplateId !== undefined
      ? moduleTemplateId
      : await vorbelegeBereich({ projectId: project.id, ticketId, email });
    const neu = await base44.entities.LaufendeZeitbuchung.create({
      ...(bereich ? { module_template_id: bereich } : {}),
      person_email: email,
      client_id: felder.client_id,
      project_id: project.id,
      sprint_id: felder.sprint_id,
      ...(ticketId ? { ticket_id: ticketId } : {}),
      gestartet_am: new Date().toISOString(),
      notiz,
      projekt_titel: project.title,
      kuerzel: kuerzel || '',
    });
    cacheWrite(neu);
    await refresh();
    return { started: neu };
  }, [email, refresh, stop]);

  // Zehn Stunden sind die Grenze — das System bucht dann NICHT selbst, sondern legt
  // die Buchung zur Bestätigung vor. Vermutlich wurde vergessen zu stoppen.
  const ueberzogen = running && elapsedMinutes >= MAX_MINUTEN;

  return { timer, running, elapsedMinutes, ueberzogen, label: zeitLabel(elapsedMinutes), start, stop, refresh };
}