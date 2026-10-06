import { base44 } from '@/api/base44Client';

// Die Zeitbuchung kennt vier Tätigkeiten (Meeting seit 06.10.2026: Jour fixe, Abstimmung, Termine).
// Die sieben Rollen bleiben der Aufgabenzuteilung vorbehalten und tauchen hier nicht mehr auf.
// Die Tätigkeit dient nur der Auswertung — ob verrechnet wird, hängt am Projekt.
export const TAETIGKEITEN = ['beratung', 'vertrieb', 'umsetzung', 'meeting'];

export const TAETIGKEIT_LABEL = {
  beratung: 'Beratung',
  vertrieb: 'Vertrieb',
  umsetzung: 'Umsetzung',
  meeting: 'Meeting',
};

export const TAETIGKEIT_FARBE = {
  beratung: 'hsl(var(--chart-1))',
  vertrieb: 'hsl(var(--chart-3))',
  umsetzung: 'hsl(var(--chart-2))',
  meeting: 'hsl(var(--chart-5))',
};

const KEY = 'zeit_letzte_taetigkeit';
export const letzteTaetigkeit = () => {
  const t = localStorage.getItem(KEY);
  return TAETIGKEITEN.includes(t) ? t : '';
};
export const merkeTaetigkeit = (t) => { if (TAETIGKEITEN.includes(t)) localStorage.setItem(KEY, t); };

export async function rollenVon(email) {
  if (!email) return [];
  const rows = await base44.entities.TeamMember.filter({ email }, 'name', 1);
  return rows[0]?.roles || [];
}

// Die Vorbelegung greift immer — die Tätigkeit hält beim Erfassen niemanden auf.
export async function vorbelegeTaetigkeit({ kategorie, ticketId, nichtVerrechenbarGrund, ausCrm } = {}) {
  if (ticketId) {
    const ticket = await base44.entities.Ticket.get(ticketId).catch(() => null);
    if (ticket) return ticket.role === 'Beratung' ? 'beratung' : 'umsetzung';
  }
  if (kategorie === 'intern') return 'vertrieb';
  if (nichtVerrechenbarGrund === 'akquise') return 'vertrieb';
  if (ausCrm) return 'vertrieb';
  if (kategorie === 'aufwand') return 'beratung';
  return 'umsetzung';
}

// Minuten je Tätigkeit — Grundlage aller drei Auswertungen.
export function summeNachTaetigkeit(eintraege = []) {
  const summen = { beratung: 0, vertrieb: 0, umsetzung: 0, meeting: 0 };
  for (const e of eintraege) {
    const k = TAETIGKEITEN.includes(e.taetigkeit) ? e.taetigkeit : 'umsetzung';
    summen[k] += Number(e.duration_minutes) || 0;
  }
  return { ...summen, gesamt: summen.beratung + summen.vertrieb + summen.umsetzung + summen.meeting };
}