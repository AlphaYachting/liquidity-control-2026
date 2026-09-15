import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

// Kunden automatisch zuweisen: Name aus dem Aufgabentitel gegen sevDesk auflösen
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY nicht gesetzt' }, { status: 500 });

    const body = await req.json().catch(() => ({}));
    const tasks = Array.isArray(body.tasks) ? body.tasks : [];
    if (tasks.length === 0) return Response.json({ success: true, assigned: 0, unresolved: [] });

    // Jeden Namen nur einmal in sevDesk suchen
    const namen = [...new Set(tasks.map((t) => String(t.suggested_customer || '').trim()).filter(Boolean))];
    const treffer = {};
    const nichtGefunden = [];

    for (const name of namen) {
      const res = await fetch(`${SEVDESK_BASE}/Contact?depth=1&limit=50&name=${encodeURIComponent(name)}`, {
        headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      });
      if (!res.ok) { nichtGefunden.push(name); continue; }
      const data = await res.json();
      const kandidaten = (data.objects || [])
        .map((c) => ({
          sevdesk_contact_id: String(c.id),
          name: c.name || [c.surename, c.familyname].filter(Boolean).join(' ') || '',
        }))
        .filter((c) => c.name);

      const exakt = kandidaten.filter((c) => norm(c.name) === norm(name));
      const wahl = exakt.length === 1 ? exakt[0]
        : exakt.length > 1 ? exakt[0]
        : kandidaten.length === 1 ? kandidaten[0]
        : null;

      if (wahl) treffer[name] = wahl;
      else nichtGefunden.push(name);
    }

    // Zuweisungen schreiben (bestehende aktualisieren, sonst anlegen)
    let assigned = 0;
    for (const t of tasks) {
      const kontakt = treffer[String(t.suggested_customer || '').trim()];
      if (!kontakt) continue;
      const daten = {
        awork_task_id: t.awork_task_id,
        customer_name: kontakt.name,
        sevdesk_contact_id: kontakt.sevdesk_contact_id,
        assigned_by: user.email,
      };
      const vorhanden = await base44.asServiceRole.entities.SupportTicketCustomer.filter({ awork_task_id: t.awork_task_id });
      if (vorhanden?.[0]) await base44.asServiceRole.entities.SupportTicketCustomer.update(vorhanden[0].id, daten);
      else await base44.asServiceRole.entities.SupportTicketCustomer.create(daten);
      assigned += 1;
    }

    return Response.json({
      success: true,
      assigned,
      unresolved: [...new Set(nichtGefunden)],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}