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
export const stundenAus = (minuten) => Math.max(0.25, Math.round((minuten / 60) * 4) / 4);
export const zeitLabel = (minuten) => `${Math.floor(minuten / 60)}:${String(minuten % 60).padStart(2, '0')}`;

export const kuerzelOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';

const laufendeVon = async (email) => {
  const rows = await base44.entities.LaufendeZeitbuchung.filter({ person_email: email }, '-gestartet_am', 1);
  return rows[0] || null;
};

// Eine Buchung aus Stunden erzeugen — die Pflichtfelder werden immer mitgeschrieben.
export async function bucheZeit({ projectId, email, hours, note = '' }) {
  const felder = await ermittleBuchungsfelder(projectId);
  return base44.entities.TimeEntry.create({
    ...felder,
    person_email: email,
    entry_date: todayIso(),
    hours,
    note,
    source: 'bestaetigt',
  });
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
    const hours = stundenAus(minutenSeit(aktuell.gestartet_am));
    await bucheZeit({
      projectId: aktuell.project_id,
      email,
      hours,
      note: [aktuell.notiz, note].filter(Boolean).join(' · '),
    });
    await base44.entities.LaufendeZeitbuchung.delete(aktuell.id);
    cacheWrite(null);
    await refresh();
    return { hours, projekt: aktuell.projekt_titel };
  }, [email, refresh]);

  // Je Person läuft genau ein Timer — ein zweiter Start braucht die ausdrückliche Bestätigung.
  const start = useCallback(async (project, kuerzel, notiz = '', { force = false } = {}) => {
    const bestehend = await laufendeVon(email);
    if (bestehend && !force) return { conflict: bestehend };
    if (bestehend) await stop();

    const felder = await ermittleBuchungsfelder(project.id);
    const neu = await base44.entities.LaufendeZeitbuchung.create({
      person_email: email,
      client_id: felder.client_id,
      project_id: project.id,
      sprint_id: felder.sprint_id,
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