import { base44 } from '@/api/base44Client';

export const TAETIGKEITEN = ['Beratung', 'Konzept', 'Text', 'Grafik', 'Web', 'Media', 'QS'];

const KEY = 'zeit_letzte_taetigkeit';
export const letzteTaetigkeit = () => localStorage.getItem(KEY) || '';
export const merkeTaetigkeit = (t) => { if (t) localStorage.setItem(KEY, t); };

export async function rollenVon(email) {
  if (!email) return [];
  const rows = await base44.entities.TeamMember.filter({ email }, 'name', 1);
  return rows[0]?.roles || [];
}

// Eine Rolle wird still gesetzt, bei mehreren gilt die zuletzt verwendete.
export async function ermittleTaetigkeit(email) {
  const rollen = await rollenVon(email);
  if (rollen.length === 1) return rollen[0];
  const letzte = letzteTaetigkeit();
  return rollen.includes(letzte) ? letzte : undefined;
}