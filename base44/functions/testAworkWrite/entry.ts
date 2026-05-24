import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const apiKey = Deno.env.get('AWORK_API_KEY');
  const apiBase = Deno.env.get('AWORK_API_BASE_URL') || 'https://api.awork.com';

  // Projektstatus abrufen (suche nach "Planung" oder ähnlichem = Entwurf)
  const statusResp = await fetch(`${apiBase}/api/v1/projectstatuses`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const statuses = statusResp.ok ? await statusResp.json() : [];
  const statusList = Array.isArray(statuses) ? statuses.map(s => ({ id: s.id, name: s.name, type: s.type })) : [];

  // Testprojekt anlegen
  const payload = {
    name: "__API_WRITE_TEST__ - bitte löschen",
    description: "Automatischer Schreibtest",
    isBillableByDefault: true
  };

  const createResp = await fetch(`${apiBase}/api/v1/projects`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  let createResult = null;
  let deleteResult = null;
  const createText = await createResp.text();

  if (createResp.ok) {
    try {
      const created = JSON.parse(createText);
      createResult = { ok: true, id: created.id, name: created.name, status: created.projectStatus };

      // Sofort wieder löschen
      const delResp = await fetch(`${apiBase}/api/v1/projects/${created.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });
      deleteResult = { ok: delResp.ok, status: delResp.status };
    } catch (e) {
      createResult = { ok: false, parseError: e.message, raw: createText.slice(0, 300) };
    }
  } else {
    createResult = { ok: false, httpStatus: createResp.status, raw: createText.slice(0, 300) };
  }

  // Firmen-Suche testen (Fuzzy-Match)
  const compResp = await fetch(`${apiBase}/api/v1/companies?page=1&pageSize=5`, {
    headers: { 'Authorization': `Bearer ${apiKey}` }
  });
  const companies = compResp.ok ? (await compResp.json()).slice(0, 5).map(c => ({ id: c.id, name: c.name })) : [];

  return Response.json({
    write_access: createResult?.ok === true,
    create_project: createResult,
    cleanup_delete: deleteResult,
    available_statuses: statusList,
    companies_sample: companies
  });
});