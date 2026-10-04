import { artVon } from '@/lib/auslastung/arbeitsart';

// Gebuchte Stunden je Person, Arbeitsart und Monat der letzten sechs vollen Monate.
// Gegen Doppelzählung: bis einschließlich Umstellungsstichtag zählt nur aWork, danach nur die App.
export function rueckblick(daten, hist) {
  const { projects, members } = daten;
  const { monate, zeiten, awork, liquidity, stichtag, supportTickets } = hist;
  const projById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const projByAwork = {};
  liquidity.forEach((l) => { if (l.awork_project_id && projById[l.project_ref_id]) projByAwork[l.awork_project_id] = projById[l.project_ref_id]; });
  projects.forEach((p) => { if (p.awork_project_id) projByAwork[p.awork_project_id] = p; });
  const mailByName = Object.fromEntries(members.map((m) => [m.name?.trim().toLowerCase(), m.email.toLowerCase()]));
  const supportIds = new Set(supportTickets.map((t) => t.id));

  const stunden = {};
  const buche = (person, art, monat, h) => {
    if (!monate.includes(monat) || !h) return;
    const ps = stunden[person] || (stunden[person] = {});
    const a = ps[art || 'unklar'] || (ps[art || 'unklar'] = {});
    a[monat] = (a[monat] || 0) + h;
  };

  zeiten.forEach((e) => {
    if (stichtag && e.entry_date <= stichtag) return;
    const art = supportIds.has(e.ticket_id) ? 'support' : artVon(projById[e.project_id]);
    buche(e.person_email?.toLowerCase(), art, e.entry_date.slice(0, 7), (e.duration_minutes || 0) / 60);
  });
  awork.forEach((e) => {
    if (stichtag && e.entry_date > stichtag) return;
    const name = e.user_name?.trim().toLowerCase();
    const person = mailByName[name] || `awork:${name}`;
    buche(person, artVon(projByAwork[e.awork_project_id]), e.entry_date.slice(0, 7), (e.duration_minutes || 0) / 60);
  });

  const personen = {};
  Object.entries(stunden).forEach(([person, arten]) => {
    const avg = {};
    const aktiv = new Set();
    Object.entries(arten).forEach(([art, m]) => {
      avg[art] = Object.values(m).reduce((s, v) => s + v, 0) / monate.length;
      Object.keys(m).forEach((k) => aktiv.add(k));
    });
    personen[person] = { avg, datenMonate: aktiv.size };
  });

  const neu = supportTickets.filter((t) => monate.includes((t.created_date || '').slice(0, 7))).length;
  const supportStd = Object.values(personen).reduce((s, p) => s + (p.avg.support || 0), 0) * monate.length;
  return {
    personen,
    supportNeuProMonat: neu / monate.length,
    stdJeSupportTicket: neu ? supportStd / neu : 0,
  };
}