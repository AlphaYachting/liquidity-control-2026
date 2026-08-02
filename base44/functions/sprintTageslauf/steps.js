import {
  todayInVienna, workdaysBetween, calendarDaysBetween, fmtDateDe, fillPlaceholders,
  loadTemplate, sendAndLog,
} from './helpers.js';

const ACTIVE_SPRINT = ['geplant', 'laufend'];

// Mail aus der Vorlage bauen und versenden
async function mailFromTemplate(ctx, type, recipient, vars, ids) {
  const tpl = await loadTemplate(ctx.base44, type, ctx.templates);
  return sendAndLog(ctx.base44, {
    type,
    recipient,
    subject: fillPlaceholders(tpl.subject, vars),
    body: fillPlaceholders(tpl.body, vars),
    ...ids,
  }, ctx.errors);
}

// Kontext einer Etappe: Sprint, Projekt, Kunde, Platzhalterwerte
function milestoneContext(ctx, milestone) {
  const sprint = ctx.sprintById[milestone.sprint_id];
  const project = sprint ? ctx.projectById[sprint.project_id] : null;
  const client = project ? ctx.clientById[project.client_id] : null;
  const frist = milestone.feedback_deadline || milestone.planned_freeze;
  return {
    sprint,
    project,
    client,
    ids: { milestoneId: milestone.id, sprintId: sprint?.id, projectId: project?.id },
    vars: {
      kunde: client?.name || 'Kunde',
      projekt: project?.title || 'Projekt',
      etappe: milestone.title,
      frist: fmtDateDe(frist),
      resttage: Math.max(0, workdaysBetween(ctx.today, frist)),
    },
  };
}

// SCHRITT 1 — Sprint-Status fortschreiben
export async function schritt1(ctx) {
  let n = 0;
  const detail = [];
  for (const sprint of ctx.sprints) {
    if (sprint.status === 'geplant') {
      const ms = (ctx.milestonesBySprint[sprint.id] || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      const gestartet = ms.length > 0 && ms[0].state !== 'input';
      if ((sprint.start_date && sprint.start_date <= ctx.today) || gestartet) {
        await ctx.base44.asServiceRole.entities.Sprint.update(sprint.id, { status: 'laufend' });
        sprint.status = 'laufend';
        n += 1;
        detail.push(`${sprint.title || sprint.id} → laufend`);
      }
    } else if (sprint.status === 'geliefert') {
      if (sprint.delivery_date && sprint.delivery_date < ctx.today) {
        await ctx.base44.asServiceRole.entities.Sprint.update(sprint.id, { status: 'abgeschlossen' });
        sprint.status = 'abgeschlossen';
        n += 1;
        detail.push(`${sprint.title || sprint.id} → abgeschlossen`);
      }
    }
  }
  return { processed: n, detail: detail.join(', ') };
}

// SCHRITT 2 — Vorwarnung A2
export async function schritt2(ctx) {
  const faellig = ctx.milestones.filter((m) =>
    m.state === 'kundenfeedback'
    && m.prewarning_date && m.prewarning_date <= ctx.today
    && m.suppress_prewarning_mail !== true
    && !ctx.hasLog(m.id, 'A2')
  );

  let n = 0;
  for (const m of faellig) {
    const c = milestoneContext(ctx, m);
    if (!c.client?.contact_email) {
      ctx.errors.push(`A2 zu "${m.title}" übersprungen — keine Kundenadresse hinterlegt.`);
      continue;
    }
    await mailFromTemplate(ctx, 'A2', c.client.contact_email, c.vars, c.ids);
    n += 1;
  }
  return { processed: n, detail: `${faellig.length} fällig` };
}

// SCHRITT 3 — Freeze erreicht A3. Läuft immer VOR der stillschweigenden Freigabe.
export async function schritt3(ctx) {
  const erreicht = ctx.milestones.filter((m) =>
    m.state === 'kundenfeedback' && m.feedback_deadline && m.feedback_deadline <= ctx.today
  );
  const ohneLog = erreicht.filter((m) => !ctx.hasLog(m.id, 'A3'));

  let n = 0;
  for (const m of ohneLog) {
    const c = milestoneContext(ctx, m);
    if (!c.client?.contact_email) {
      ctx.errors.push(`A3 zu "${m.title}" übersprungen — keine Kundenadresse hinterlegt.`);
      continue;
    }
    await mailFromTemplate(ctx, 'A3', c.client.contact_email, c.vars, c.ids);
    n += 1;
  }
  ctx.freezeErreicht = erreicht;
  return { processed: n, detail: `${erreicht.length} Etappen mit erreichtem Freeze` };
}

// SCHRITT 4 — Stillschweigende Freigabe bzw. Signal, wenn Feedback vorliegt
export async function schritt4(ctx) {
  let freigegeben = 0;
  let mitFeedback = 0;

  for (const m of ctx.freezeErreicht || []) {
    // Vor jedem Schreibvorgang: existiert bereits eine Approval, ist alles gelaufen
    const existing = await ctx.base44.asServiceRole.entities.Approval.filter({ milestone_id: m.id }, '-approved_at', 1);
    if (existing.length > 0) continue;

    const c = milestoneContext(ctx, m);

    if ((ctx.feedbacksByMilestone[m.id] || []).length > 0) {
      mitFeedback += 1;
      ctx.addSignal({
        signal_type: 'W2',
        severity: 'warnung',
        recommendation: `Frist abgelaufen, Feedback liegt vor — Etappe ${m.title} bei ${c.vars.kunde} aktiv freigeben.`,
        project_id: c.project?.id,
        sprint_id: c.sprint?.id,
        milestone_id: m.id,
        responsible: c.project?.pm_email,
      });
      continue;
    }

    const now = new Date().toISOString();
    const ticketsOfMilestone = ctx.ticketsByMilestone[m.id] || [];

    await ctx.base44.asServiceRole.entities.Approval.create({
      milestone_id: m.id,
      sprint_id: c.sprint?.id || '',
      project_id: c.project?.id || '',
      approved_at: now,
      approval_type: 'stillschweigend',
      source: 'Fristablauf ohne Rückmeldung',
      frozen_state: JSON.stringify({
        titel: m.title,
        lieferstand: m.deliverable_links || [],
        aufgaben: ticketsOfMilestone.map((t) => ({ titel: t.title, status: t.status, rolle: t.role })),
      }),
      approved_amount: m.milestone_amount || 0,
      agb_version: c.client?.agb_version || '',
    });

    // invoiced_at bleibt leer — der Tageslauf fakturiert nie.
    await ctx.base44.asServiceRole.entities.Milestone.update(m.id, {
      state: 'freigegeben',
      released: true,
      released_at: now,
    });
    m.state = 'freigegeben';
    m.released = true;

    if (c.client?.contact_email) {
      await mailFromTemplate(ctx, 'A4', c.client.contact_email, c.vars, c.ids);
    } else {
      ctx.errors.push(`A4 zu "${m.title}" übersprungen — keine Kundenadresse hinterlegt.`);
    }

    const restOffen = (ctx.milestonesBySprint[m.sprint_id] || [])
      .filter((x) => x.id !== m.id && x.state !== 'freigegeben').length;
    if (restOffen === 0 && c.sprint && c.sprint.status !== 'abgeschlossen' && c.sprint.status !== 'geliefert') {
      await ctx.base44.asServiceRole.entities.Sprint.update(c.sprint.id, { status: 'geliefert' });
      c.sprint.status = 'geliefert';
    }

    freigegeben += 1;
  }

  // Signale aus diesem Schritt sofort schreiben, damit die Reihenfolge stimmt
  await ctx.flushSignals();

  return {
    processed: freigegeben,
    detail: mitFeedback > 0 ? `${mitFeedback} mit Feedback — aktive Freigabe nötig` : '',
  };
}

// SCHRITT 5 — Sprint läuft aus A5 (intern an den PM)
export async function schritt5(ctx) {
  const faellig = ctx.sprints.filter((s) =>
    s.status === 'laufend'
    && s.delivery_date
    && calendarDaysBetween(ctx.today, s.delivery_date) <= 21
    && !ctx.hasSprintLog(s.id, 'A5')
  );

  let n = 0;
  for (const sprint of faellig) {
    const project = ctx.projectById[sprint.project_id];
    const client = project ? ctx.clientById[project.client_id] : null;
    if (!project?.pm_email) {
      ctx.errors.push(`A5 zu Sprint "${sprint.title || sprint.id}" übersprungen — kein PM hinterlegt.`);
      continue;
    }
    await mailFromTemplate(ctx, 'A5', project.pm_email, {
      kunde: client?.name || 'Kunde',
      projekt: project.title,
      etappe: sprint.title || `Sprint ${sprint.size}`,
      frist: fmtDateDe(sprint.delivery_date),
      resttage: Math.max(0, workdaysBetween(ctx.today, sprint.delivery_date)),
    }, { sprintId: sprint.id, projectId: project.id });
    n += 1;
  }
  return { processed: n, detail: '' };
}

// SCHRITT 6 — Warnsignale W1 bis W4
export async function schritt6(ctx) {
  const aktive = ctx.sprints.filter((s) => ACTIVE_SPRINT.includes(s.status));

  for (const sprint of aktive) {
    const project = ctx.projectById[sprint.project_id];
    const client = project ? ctx.clientById[project.client_id] : null;
    const kunde = client?.name || project?.title || 'Projekt';
    const pm = project?.pm_email;
    const ms = (ctx.milestonesBySprint[sprint.id] || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

    // W1 — Zeitbudget
    const stunden = ctx.hoursOfSprint(sprint);
    const ziel = sprint.target_hours || 0;
    const frei = ms.filter((m) => m.state === 'freigegeben').length;
    if (ziel > 0 && stunden > 0.7 * ziel && frei < ms.length / 2) {
      ctx.addSignal({
        signal_type: 'W1',
        severity: 'warnung',
        recommendation: `Projekt ${kunde}: ${Math.round((stunden / ziel) * 100)} % der Zeit verbraucht, erst ${frei} von ${ms.length} Etappen freigegeben. Scope mit ${pm || 'dem PM'} prüfen.`,
        project_id: project?.id,
        sprint_id: sprint.id,
        responsible: pm,
      });
    }

    // W2 — Kundenschweigen
    for (const m of ms) {
      if (m.state !== 'kundenfeedback') continue;
      if ((ctx.feedbacksByMilestone[m.id] || []).length > 0) continue;
      if (!m.handover_date || !m.feedback_deadline) continue;
      const fenster = calendarDaysBetween(m.handover_date, m.feedback_deadline);
      if (fenster <= 0) continue;
      const verstrichen = calendarDaysBetween(m.handover_date, ctx.today) / fenster;
      if (verstrichen <= 0.5) continue;
      ctx.addSignal({
        signal_type: 'W2',
        severity: verstrichen > 0.8 ? 'kritisch' : 'hinweis',
        recommendation: `Kunde ${kunde} hat zu Etappe ${m.title} nicht reagiert, noch ${Math.max(0, workdaysBetween(ctx.today, m.feedback_deadline))} Arbeitstage bis zum Freeze. Anruf empfohlen.`,
        project_id: project?.id,
        sprint_id: sprint.id,
        milestone_id: m.id,
        responsible: pm,
      });
    }

    // W3 — Stillstand in der aktiven Etappe
    const aktiv = ms.find((m) => m.state !== 'freigegeben');
    if (aktiv) {
      for (const t of ctx.ticketsByMilestone[aktiv.id] || []) {
        if (t.status === 'erledigt' || t.status === 'wartet') continue;
        const seit = (t.last_status_change || t.created_date || '').slice(0, 10);
        if (!seit) continue;
        const tage = workdaysBetween(seit, ctx.today);
        if (tage <= 5) continue;
        ctx.addSignal({
          signal_type: 'W3',
          severity: 'hinweis',
          recommendation: `Aufgabe ${t.title} steht seit ${tage} Arbeitstagen. Rückfrage an ${t.assignee_email || pm || 'den PM'}.`,
          project_id: project?.id,
          sprint_id: sprint.id,
          ticket_id: t.id,
          responsible: pm,
        });
      }
    }

    // W4 — kein Folgesprint
    if (sprint.status === 'laufend' && sprint.delivery_date
      && calendarDaysBetween(ctx.today, sprint.delivery_date) < 21
      && sprint.successor_offered !== true) {
      ctx.addSignal({
        signal_type: 'W4',
        severity: 'warnung',
        recommendation: `Sprint ${sprint.title || `Sprint ${sprint.size}`} bei ${kunde} endet am ${fmtDateDe(sprint.delivery_date)}, kein Folgeangebot. Angebot vorbereiten.`,
        project_id: project?.id,
        sprint_id: sprint.id,
        responsible: pm,
      });
    }
  }

  return ctx.flushSignals();
}

// SCHRITT 7 — Signale auflösen, deren Bedingung nicht mehr zutrifft
export async function schritt7(ctx) {
  const now = new Date().toISOString();
  let n = 0;
  for (const s of ctx.signals) {
    if (s.resolved) continue;
    if (!['W1', 'W2', 'W3', 'W4'].includes(s.signal_type)) continue;
    if (ctx.liveKeys.has(ctx.signalKey(s))) continue;
    await ctx.base44.asServiceRole.entities.IntelligenceSignal.update(s.id, { resolved: true, resolved_at: now });
    n += 1;
  }
  return { processed: n, detail: '' };
}

export const HEUTE = todayInVienna;