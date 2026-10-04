import { base44 } from '@/api/base44Client';

const SEITE = 500;

async function seitenweise(entity, query, sort) {
  const alle = [];
  for (let skip = 0; ; skip += SEITE) {
    const seite = await entity.filter(query, sort, SEITE, skip);
    alle.push(...seite);
    if (seite.length < SEITE) break;
  }
  return alle;
}

// Die letzten sechs vollen Monate als YYYY-MM, älteste zuerst
export function letzteMonate(n = 6) {
  const d = new Date();
  const out = [];
  for (let i = n; i >= 1; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export async function ladeHistorie() {
  const monate = letzteMonate();
  const von = `${monate[0]}-01`;
  const bis = `${monate[5]}-31`;
  const [zeiten, awork, liquidity, setting, supportTickets] = await Promise.all([
    seitenweise(base44.entities.TimeEntry, { entry_date: { $gte: von, $lte: bis } }, 'entry_date'),
    seitenweise(base44.entities.AworkTimeEntry, { entry_date: { $gte: von, $lte: bis } }, 'entry_date'),
    base44.entities.LiquidityProject.list('-created_date', 2000),
    base44.entities.Setting.filter({ key: 'awork_umstellung_stichtag' }, 'key', 1),
    seitenweise(base44.entities.Ticket, { origin: 'support' }, 'created_date'),
  ]);
  return { monate, zeiten, awork, liquidity, stichtag: setting[0]?.value || null, supportTickets };
}