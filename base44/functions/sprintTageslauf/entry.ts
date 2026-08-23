import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { todayInVienna } from './helpers.js';
import { schritt1, schritt2, schritt3, schritt4, schritt5, schritt6, schritt7 } from './steps.js';
import { schritt8 } from './zeitvorschlaege.js';
import { schritt9 } from './erinnerung.js';
import { schritt10 } from './offeneTage.js';

const SCHRITTE = [
  { key: 'S1', label: 'Sprint-Status fortgeschrieben', run: schritt1 },
  { key: 'S2', label: 'Vorwarnungen versendet (A2)', run: schritt2 },
  { key: 'S3', label: 'Fristmeldungen versendet (A3)', run: schritt3 },
  { key: 'S4', label: 'Stillschweigende Freigaben', run: schritt4 },
  { key: 'S5', label: 'Auslaufende Sprints gemeldet (A5)', run: schritt5 },
  { key: 'S6', label: 'Warnsignale erzeugt', run: schritt6 },
  { key: 'S7', label: 'Signale aufgelöst', run: schritt7 },
  { key: 'S8', label: 'Zeitvorschläge', run: schritt8 },
  { key: 'S9', label: 'Erinnerung unbestätigte Tage', run: schritt9 },
  { key: 'S10', label: 'Erinnerung offene Arbeitstage', run: schritt10 },
];

const groupBy = (rows, key) => rows.reduce((acc, r) => {
  const k = r[key];
  if (!k) return acc;
  (acc[k] = acc[k] || []).push(r);
  return acc;
}, {});

export default async function (req: Request): Promise<Response> {
  const started = Date.now();
  const startedAt = new Date().toISOString();

  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await base44.auth.me().catch(() => null);

    const payload = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const manuell = payload.manual === true;

    const sr = base44.asServiceRole.entities;
    const [sprints, milestones, tickets, projects, clients, notifications, feedbacks, timeEntries, signals] =
      await Promise.all([
        sr.Sprint.list('-created_date', 500),
        sr.Milestone.list('order', 2000),
        sr.Ticket.list('order', 5000),
        sr.Project.list('-created_date', 500),
        sr.Client.list('name', 500),
        sr.NotificationLog.list('-sent_at', 3000),
        sr.Feedback.list('-received_at', 2000),
        sr.TimeEntry.list('-entry_date', 5000),
        sr.IntelligenceSignal.filter({ resolved: false }, '-triggered_at', 1000),
      ]);

    const logKeys = new Set(notifications.filter((n) => n.milestone_id).map((n) => `${n.milestone_id}|${n.type}`));
    const sprintLogKeys = new Set(notifications.filter((n) => n.sprint_id).map((n) => `${n.sprint_id}|${n.type}`));

    const signalKey = (s) =>
      `${s.signal_type}|${s.milestone_id || s.ticket_id || s.sprint_id || s.project_id || ''}|${s.severity}`;
    const openKeys = new Set(signals.map(signalKey));
    const liveKeys = new Set();
    const pending = [];

    const ctx = {
      base44,
      today: todayInVienna(),
      templates: {},
      errors: [],
      sprints,
      milestones,
      signals,
      liveKeys,
      signalKey,
      sprintById: Object.fromEntries(sprints.map((s) => [s.id, s])),
      projectById: Object.fromEntries(projects.map((p) => [p.id, p])),
      clientById: Object.fromEntries(clients.map((c) => [c.id, c])),
      milestonesBySprint: groupBy(milestones, 'sprint_id'),
      ticketsByMilestone: groupBy(tickets, 'milestone_id'),
      feedbacksByMilestone: groupBy(feedbacks, 'milestone_id'),
      hasLog: (milestoneId, type) => logKeys.has(`${milestoneId}|${type}`),
      hasSprintLog: (sprintId, type) => sprintLogKeys.has(`${sprintId}|${type}`),
      hoursOfSprint: (sprint) => timeEntries
        .filter((t) => t.sprint_id === sprint.id
          || (t.project_id === sprint.project_id
            && (!sprint.start_date || t.entry_date >= sprint.start_date)
            && (!sprint.delivery_date || t.entry_date <= sprint.delivery_date)))
        .reduce((s, t) => s + (t.hours || 0), 0),
      // Signal nur anlegen, wenn zur gleichen Kombination kein offenes existiert
      addSignal: (sig) => {
        const key = signalKey(sig);
        liveKeys.add(key);
        if (openKeys.has(key)) return;
        openKeys.add(key);
        pending.push(sig);
      },
      flushSignals: async () => {
        let n = 0;
        while (pending.length > 0) {
          const sig = pending.shift();
          const created = await sr.IntelligenceSignal.create({
            ...sig,
            triggered_at: new Date().toISOString(),
            resolved: false,
          });
          signals.push(created);
          n += 1;
        }
        return { processed: n, detail: '' };
      },
    };

    const steps = [];
    for (const schritt of SCHRITTE) {
      try {
        const res = await schritt.run(ctx);
        steps.push({ key: schritt.key, label: schritt.label, processed: res.processed || 0, detail: res.detail || '' });
      } catch (e) {
        // Ein Fehler bricht den Job nicht ab
        ctx.errors.push(`${schritt.key} ${schritt.label}: ${e.message}`);
        steps.push({ key: schritt.key, label: schritt.label, processed: 0, detail: e.message, failed: true });
      }
    }

    const finishedAt = new Date().toISOString();
    const run = await sr.SprintDailyRun.create({
      run_date: ctx.today,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_ms: Date.now() - started,
      trigger: manuell ? 'manuell' : 'automatisch',
      triggered_by: manuell ? (user?.email || '') : '',
      status: ctx.errors.length > 0 ? 'mit_fehlern' : 'erfolgreich',
      steps,
      errors: ctx.errors.slice(0, 50),
    });

    return Response.json({ success: true, run });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}