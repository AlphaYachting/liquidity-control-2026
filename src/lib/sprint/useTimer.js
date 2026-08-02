import { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { todayIso } from '@/components/sprint/sprintConfig';

const KEY = 'sprint_timer';

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Läuft der Timer, überlebt er Seitenwechsel und Reload — er hängt am Browser, nicht an einer Seite.
export function useTimer() {
  const [timer, setTimer] = useState(read);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!timer) return;
    const i = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(i);
  }, [timer]);

  useEffect(() => {
    const sync = () => setTimer(read());
    window.addEventListener('storage', sync);
    window.addEventListener('sprint-timer-changed', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('sprint-timer-changed', sync);
    };
  }, []);

  const write = (value) => {
    if (value) localStorage.setItem(KEY, JSON.stringify(value));
    else localStorage.removeItem(KEY);
    setTimer(value);
    window.dispatchEvent(new Event('sprint-timer-changed'));
  };

  const start = useCallback((project, kuerzel) => {
    write({
      project_id: project.id,
      project_title: project.title,
      kuerzel: kuerzel || '',
      started_at: new Date().toISOString(),
    });
  }, []);

  const cancel = useCallback(() => write(null), []);

  const elapsedMinutes = timer
    ? Math.max(0, Math.floor((Date.now() - new Date(timer.started_at).getTime()) / 60000))
    : 0;

  // Beim Stoppen entsteht eine Zeitbuchung auf Viertelstunden gerundet, mindestens 0,25 h.
  const stop = useCallback(async (userEmail, note = '') => {
    if (!timer) return;
    const hours = Math.max(0.25, Math.round((elapsedMinutes / 60) * 4) / 4);
    await base44.entities.TimeEntry.create({
      project_id: timer.project_id,
      person_email: userEmail,
      entry_date: todayIso(),
      hours,
      note,
      source: 'bestaetigt',
    });
    write(null);
    return hours;
  }, [timer, elapsedMinutes]);

  const label = `${Math.floor(elapsedMinutes / 60)}:${String(elapsedMinutes % 60).padStart(2, '0')}`;

  return { timer, running: !!timer, elapsedMinutes, label, start, stop, cancel, tick };
}

export const kuerzelOf = (name = '') =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '—';