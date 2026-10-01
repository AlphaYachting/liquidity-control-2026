import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  wirksamerBeginn, ladeStichtag, heuteWien, zaehltFuerLaufzeit, stundenVon, laufzeitAusSummen,
} from '../../shared/kontingentLaufzeit.js';

// Drei Summen je Projekt — statt tausend Buchungen im Browser. Bei Retainern zusätzlich der Saldo seit Laufzeitbeginn.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const projectId = body.project_id;
    if (!projectId) return Response.json({ error: 'project_id fehlt' }, { status: 400 });

    const svc = base44.asServiceRole;
    const sprints = await svc.entities.Sprint.filter({ project_id: projectId }, 'delivery_date', 100);
    const laufend = sprints
      .filter((s) => s.status === 'laufend')
      .sort((a, b) => (a.delivery_date || '9999-12-31').localeCompare(b.delivery_date || '9999-12-31'))[0] || null;

    const now = new Date();
    const monatPraefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Retainer-Laufzeit vorbereiten (abrechnungsmodell 'paket', nicht legacy, Kontingent > 0)
    const project = await svc.entities.Project.get(projectId);
    const istRetainer = project.abrechnungsmodell === 'paket'
      && !project.is_legacy
      && (Number(project.support_kontingent_stunden) || 0) > 0;
    let laufzeit = undefined;
    let rBeginn = null, rQuelle = null, rAbNummer = null, rStichtag = null, rHeute = null;
    let rGebuchtApp = 0, rMehrleistungAbgerechnet = 0;

    if (istRetainer) {
      const wb = await wirksamerBeginn(svc.entities, project);
      rBeginn = wb.beginn;
      rQuelle = wb.quelle;
      rAbNummer = wb.ab_nummer;
      rStichtag = await ladeStichtag(svc.entities);
      rHeute = heuteWien();
    }

    let gesamt = 0;
    let sprintSumme = 0;
    let monat = 0;
    let skip = 0;
    const limit = 500;
    while (true) {
      const page = await svc.entities.TimeEntry.filter(
        { project_id: projectId }, '-entry_date', limit, skip
      );
      for (const e of page) {
        const h = Number(e.hours) || (Number(e.duration_minutes) || 0) / 60;
        gesamt += h;
        if (laufend && e.sprint_id === laufend.id) sprintSumme += h;
        if ((e.entry_date || '').startsWith(monatPraefix)) monat += h;
        // Retainer: in derselben Schleife die Laufzeit-Summen mitführen
        if (istRetainer && rBeginn && zaehltFuerLaufzeit(e, { beginn: rBeginn, stichtag: rStichtag })) {
          rGebuchtApp += stundenVon(e);
        }
        if (istRetainer && e.ueber_kontingent === true && e.abrechnungsstatus === 'abgerechnet') {
          rMehrleistungAbgerechnet += stundenVon(e);
        }
      }
      if (page.length < limit) break;
      skip += limit;
    }

    if (istRetainer) {
      laufzeit = laufzeitAusSummen({
        project, beginn: rBeginn, quelle: rQuelle, ab_nummer: rAbNummer,
        stichtag: rStichtag, heute: rHeute,
        gebucht_app: rGebuchtApp, mehrleistung_abgerechnet: rMehrleistungAbgerechnet,
      });
    }

    // Nächste überzogene Zwischenfrist des laufenden Sprints — trägt die einzige Warnzeile.
    let frist = null;
    if (laufend) {
      const heute = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const milestones = await svc.entities.Milestone.filter({ sprint_id: laufend.id }, 'order', 50);
      for (const m of milestones) {
        if (m.released) continue;
        const datum = m.feedback_deadline || m.planned_freeze || m.planned_handover;
        if (!datum || datum >= heute) continue;
        const tage = Math.round((new Date(`${heute}T00:00:00`) - new Date(`${datum}T00:00:00`)) / 86400000);
        if (!frist || tage > frist.tage) frist = { name: m.title, tage };
      }
    }

    const r2 = (v) => Math.round(v * 100) / 100;
    return Response.json({
      sprint_id: laufend?.id || null,
      sprint_titel: laufend?.title || null,
      sprint_target_hours: laufend?.target_hours || 0,
      sprint_start_date: laufend?.start_date || null,
      sprint_delivery_date: laufend?.delivery_date || null,
      frist,
      gebucht_sprint: r2(sprintSumme),
      gebucht_monat: r2(monat),
      gebucht_gesamt: r2(gesamt),
      ...(laufzeit ? { laufzeit } : {}),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
