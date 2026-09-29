import { todayIso } from '@/components/sprint/sprintConfig';

export const laufenderMonat = () => todayIso().slice(0, 7);

export const monatsName = (monat) =>
  new Date(`${monat}-01T12:00:00`).toLocaleDateString('de-AT', { month: 'long' });

export const stundenVon = (e) => (e.duration_minutes != null ? e.duration_minutes / 60 : Number(e.hours) || 0);

export const imMonat = (entries, monat) => entries.filter((e) => (e.entry_date || '').startsWith(monat));

export const h1 = (v) => (Math.round(v * 10) / 10).toLocaleString('de-AT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Offene Aufgaben: nach Fälligkeit (ohne Datum zuletzt), dann Anlagedatum
export const nachFaelligkeit = (a, b) => {
  if (a.planned_for && b.planned_for && a.planned_for !== b.planned_for) return a.planned_for.localeCompare(b.planned_for);
  if (a.planned_for && !b.planned_for) return -1;
  if (!a.planned_for && b.planned_for) return 1;
  return (a.created_date || '').localeCompare(b.created_date || '');
};