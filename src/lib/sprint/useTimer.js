import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { todayIso } from '@/components/sprint/sprintConfig';
import { ermittleBuchungsfelder } from './buchungsfelder';

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
  if (timer) localStorage.setItem(KEY, JSON.stringify(timer));
  else localStorage.removeItem(KEY);
};

const minutenSeit = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));

// Rundung ausschließlich für die Anzeige eines Abrechnungsbetrags — niemals vor dem Speichern.
export const viertelstundeAus = (minuten) => Math.max(0.25, Math.round((minuten / 60) * 4) / 4);
export const stundenAus = (minuten) => Math.round((minuten / 60) * 100) / 100;
export const zeitLabel = (minuten) => `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')}`;

// Tag im lokalen Kalender — ein Timer von 23:30 bis 00:30 gehört auf den Starttag.
export const tagVon = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const kuerzelOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

const laufendeVon = async (email) => {
  const rows = await base44.entities.LaufendeZeitbuchung.filter({ person_email: email }, '-gestartet_am', 1);
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
  ueberKontingent, quelle = 'timer', korrekturZu, ticketId,
}) {
  const felder = await ermittleBuchungsfelder(projectId);
  const minuten = Math.round(Number(durationMinutes) || 0);
  return base44.entities.TimeEntry.create({
    ...felder,
    ...(verrechenbar === undefined ? {} : { verrechenbar, abrechenbar: verrechenbar }),
    ...(nichtVerrechenbarGrund ? { nicht_verrechenbar_grund: nichtVerrechenbarGrund } : {}),
    ...(taetigkeit ? { taetigkeit } : {}),
    ...(ticketId ? { ticket_id: ticketId } : {}),
    ...(korrekturZu ? { korrektur_zu: korrekturZu } : {}),
    person_email: email,
    entry_date: entryDate || todayIso(),
    started_at: startedAt,
    ended_at: endedAt,
    duration_minutes: minuten,
    hours: stundenAus(minuten),
    ueber_kontingent: !!ueberKontingent,
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
      quelle: 'korrektur',
      korrekturZu: original.id,
    });
  }

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

export function useTimer(email) {
  const qc = useQueryClient();
  const [, setTick] = useState(0);

  const { data: timer } = useQuery({
    queryKey: ['laufendeZeitbuchung', email],
    enabled: !!email,
    initialData: () => cacheRead(email),
    queryFn: async () => {
      const t = await laufendeVon(email);
      cacheWrite(t);
      return t;
    },
  });

  const running = !!timer;
  const elapsedMinutes = running ? minutenSeit(timer.gestartet_am) : 0;

  useEffect(() => {
    if (!running) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [running]);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['laufendeZeitbuchung', email] }), [qc, email]);

  const stop = useCallback(async (note = '') => {
    const aktuell = await laufendeVon(email);
    if (!aktuell) {
      await refresh();
      return null;
    }
    const minuten = minutenSeit(aktuell.gestartet_am);
    const ende = new Date().toISOString();
    await bucheZeit({
      projectId: aktuell.project_id,
      email,
      durationMinutes: minuten,
      entryDate: tagVon(aktuell.gestartet_am),
      startedAt: aktuell.gestartet_am,
      endedAt: ende,
      note: [aktuell.notiz, note].filter(Boolean).join(' · '),
      quelle: 'timer',
      ticketId: aktuell.ticket_id,
    });
    await base44.entities.LaufendeZeitbuchung.delete(aktuell.id);
    cacheWrite(null);
    await refresh();
    return { hours: stundenAus(minuten), minuten, projekt: aktuell.projekt_titel };
  }, [email, refresh]);

  // Je Person läuft genau ein Timer — ein zweiter Start braucht die ausdrückliche Bestätigung.
  const start = useCallback(async (project, kuerzel, notiz = '', { force = false, ticketId } = {}) => {
    const bestehend = await laufendeVon(email);
    if (bestehend && !force) return { conflict: bestehend };
    if (bestehend) await stop();

    const felder = await ermittleBuchungsfelder(project.id);
    const neu = await base44.entities.LaufendeZeitbuchung.create({
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

  // Zehn Stunden sind die Grenze — danach stoppt das System selbst.
  useEffect(() => {
    if (running && elapsedMinutes >= MAX_MINUTEN) stop('automatisch gestoppt');
  }, [running, elapsedMinutes, stop]);

  return { timer, running, elapsedMinutes, label: zeitLabel(elapsedMinutes), start, stop };
}