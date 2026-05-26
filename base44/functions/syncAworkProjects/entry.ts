import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));


Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = Deno.env.get('AWORK_API_KEY');
  const apiBase = Deno.env.get('AWORK_API_BASE_URL') || 'https://api.awork.com';

  if (!apiKey) {
    return Response.json({ error: 'AWORK_API_KEY not configured' }, { status: 400 });
  }

  // Alle Seiten abrufen (Pagination), um keine Projekte zu verlieren
  let allProjects = [];
  let page = 1;
  const pageSize = 100;
  while (true) {
    const resp = await fetch(`${apiBase}/api/v1/projects?page=${page}&pageSize=${pageSize}`, {
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });
    if (!resp.ok) {
      const errText = await resp.text();
      return Response.json({ error: `awork API error: ${resp.status} (page ${page})`, detail: errText.slice(0, 500) }, { status: 502 });
    }
    const data = await resp.json();
    const pageProjects = Array.isArray(data) ? data : (data.data || []);
    allProjects = allProjects.concat(pageProjects);
    console.log(`awork projects page ${page}: ${pageProjects.length} fetched (total so far: ${allProjects.length})`);
    if (pageProjects.length < pageSize) break; // letzte Seite erreicht
    page++;
    await sleep(300);
  }

  // ALLE Projekte speichern (inkl. abgeschlossene), damit der Frontend-Filter "Alle anzeigen" korrekt funktioniert.
  // is_archived wird korrekt gesetzt — der Filter im UI entscheidet was angezeigt wird.

  const now = new Date().toISOString();
  let created = 0, updated = 0, failed = 0;

  const BATCH_SIZE = 5;
  for (let i = 0; i < allProjects.length; i += BATCH_SIZE) {
    const batch = allProjects.slice(i, i + BATCH_SIZE);

    for (const proj of batch) {
      const members = proj.members || [];
      const responsible = members.find(m => m.isProjectLead) || members[0];
      const snapshot = {
        awork_project_id: proj.id,
        project_key: proj.projectKey || proj.key || '',
        name: proj.name || '',
        description: proj.description || '',
        company_id: proj.company?.id || '',
        company_name: proj.company?.name || '',
        project_status: proj.projectStatus?.name || '',
        project_type: proj.projectType?.name || '',
        start_date: proj.startDate ? proj.startDate.split('T')[0] : null,
        due_date: proj.dueDate ? proj.dueDate.split('T')[0] : null,
        // awork liefert timeBudget und trackedDuration in Sekunden → umrechnen in Minuten
        time_budget_minutes: proj.timeBudget ? Math.round(proj.timeBudget / 60) : 0,
        tracked_duration_minutes: proj.trackedDuration ? Math.round(proj.trackedDuration / 60) : 0,
        tasks_count: proj.tasksCount || 0,
        tasks_done_count: proj.tasksDoneCount || 0,
        progress_percent: proj.tasksCount > 0
          ? Math.round(((proj.tasksDoneCount || 0) / proj.tasksCount) * 100) : 0,
        responsible_user_name: responsible?.name || '',
        responsible_user_email: responsible?.email || '',
        members_json: JSON.stringify(members.map(m => ({ id: m.userId, name: m.name, email: m.email }))),
        custom_fields_json: JSON.stringify(proj.entityCustomFields || []),
        raw_payload: JSON.stringify(proj), // kein slice — vollständiger Payload für korrekte Stundenberechnung
        last_synced_at: now,
        is_archived: proj.isArchived === true
      };

      try {
        const existing = await base44.asServiceRole.entities.AworkProjectSnapshot.filter({ awork_project_id: proj.id });
        await sleep(150);
        if (existing && existing.length > 0) {
          await base44.asServiceRole.entities.AworkProjectSnapshot.update(existing[0].id, snapshot);
          updated++;
        } else {
          await base44.asServiceRole.entities.AworkProjectSnapshot.create(snapshot);
          created++;
        }
        await sleep(150);
      } catch (e) {
        console.error('Failed to upsert project', proj.id, e.message);
        failed++;
        await sleep(400);
      }
    }

    // Extra pause between batches
    await sleep(300);
  }

  // Update integration setting
  try {
    const settings = await base44.asServiceRole.entities.AworkIntegrationSetting.list();
    await sleep(200);
    const settingData = {
      connection_status: 'connected',
      last_successful_sync: now,
      total_projects_synced: created + updated,
      notes: `Alle Projekte gespeichert (inkl. abgeschlossen). Gefiltert wird im Frontend.`
    };
    if (settings.length > 0) {
      await base44.asServiceRole.entities.AworkIntegrationSetting.update(settings[0].id, settingData);
    } else {
      await base44.asServiceRole.entities.AworkIntegrationSetting.create({
        ...settingData, api_base_url: apiBase, read_only_mode: true
      });
    }
  } catch (e) {
    console.error('Failed to update integration setting', e.message);
  }

  return Response.json({
    success: true,
    projects_fetched: allProjects.length,
    created,
    updated,
    failed
  });
});