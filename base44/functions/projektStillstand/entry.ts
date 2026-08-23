import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Meldet stillstehende Projekte mit gebundenem offenem Betrag.
// Schreibt nichts und versendet nichts — liefert nur die Liste.
const TAG = 86400000;

function planqualitaet(snapshot) {
  const budget = Number(snapshot?.time_budget_minutes) || 0;
  const tracked = Number(snapshot?.tracked_duration_minutes) || 0;
  if (!budget) return 'fehlt';
  if (tracked > 10 * budget) return 'ungepflegt';
  return 'ok';
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const projekte = await base44.asServiceRole.entities.LiquidityProject.filter(
      { is_active_for_billing: true }, '-created_date', 2000
    );
    const snapshots = await base44.asServiceRole.entities.AworkProjectSnapshot.list('-created_date', 3000);
    const snapshotNachId = new Map(snapshots.map(s => [s.awork_project_id, s]));

    const heute = Date.now();
    const befunde = [];

    for (const p of projekte) {
      const offen = Number(p.open_amount) || 0;
      if (offen <= 0) continue;

      let letzte = null;
      let minuten = 0;
      if (p.awork_project_id) {
        const buchungen = await base44.asServiceRole.entities.AworkTimeEntry.filter(
          { awork_project_id: p.awork_project_id }, '-entry_date', 500
        );
        minuten = buchungen.reduce((s, b) => s + (Number(b.duration_minutes) || 0), 0);
        letzte = buchungen.map(b => b.entry_date).filter(Boolean).sort().reverse()[0] || null;
      }

      const tage = letzte ? Math.floor((heute - new Date(letzte).getTime()) / TAG) : null;
      if (tage !== null && tage < 14) continue;

      const snapshot = p.awork_project_id ? snapshotNachId.get(p.awork_project_id) : null;
      const qualitaet = planqualitaet(snapshot);
      const schweregrad = tage === null || tage >= 45 ? 'kritisch' : tage >= 28 ? 'warnung' : 'hinweis';

      befunde.push({
        customer: p.customer || '',
        project_name: p.project_name || '',
        letzte_buchung: letzte,
        tage_seit_buchung: tage,
        open_amount_net: offen,
        gebuchte_stunden: Math.round((minuten / 60) * 10) / 10,
        aufgaben_erledigt: Number(snapshot?.tasks_done_count) || 0,
        aufgaben_gesamt: Number(snapshot?.tasks_count) || 0,
        abrechnungsmodell: p.abrechnungsmodell || 'unbekannt',
        planqualitaet: qualitaet,
        budget_ampel_erlaubt: qualitaet === 'ok',
        budget_hinweis: qualitaet === 'ok' ? null : 'Planwert nicht gepflegt',
        schweregrad,
      });
    }

    befunde.sort((a, b) => b.open_amount_net - a.open_amount_net);

    return Response.json({
      geprueft: projekte.length,
      befunde_anzahl: befunde.length,
      gebundener_betrag_netto: befunde.reduce((s, b) => s + b.open_amount_net, 0),
      befunde,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}