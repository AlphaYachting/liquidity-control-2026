import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

// sevDesk Statuscodes -> Klartext
const SEVDESK_STATUS = {
  '50': 'storniert',
  '100': 'Entwurf',
  '200': 'versendet / offen',
  '750': 'teilbezahlt',
  '1000': 'bezahlt',
};

function istSupportProjekt(p) {
  const name = p.name || '';
  const typ = p.project_type || '';
  return /wartungsvertrag|support/i.test(typ) || /support|wartung|service paket/i.test(name);
}

async function alleSeiten(fetcher) {
  const out = [];
  let offset = 0;
  const size = 500;
  while (true) {
    const page = await fetcher(size, offset);
    out.push(...page);
    if (page.length < size) break;
    offset += size;
    if (offset > 20000) break;
  }
  return out;
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = secrets.get('SEVDESK_API_KEY');

    // Stichtag: Insolvenzeröffnung 24.07.2026 — nur Buchungen ab diesem Tag
    const body = await req.json().catch(() => ({}));
    const since = body?.since === null ? null : (body?.since || '2026-07-24');

    // 1. awork Support-/Wartungsprojekte
    const projekte = await alleSeiten((l, o) =>
      base44.asServiceRole.entities.AworkProjectSnapshot.list('-last_synced_at', l, o)
    );
    const supportProjekte = projekte.filter(istSupportProjekt);
    const projektById = {};
    supportProjekte.forEach(p => { projektById[p.awork_project_id] = p; });

    // 2. Erledigte Aufgaben dieser Projekte
    const aufgaben = await alleSeiten((l, o) =>
      base44.asServiceRole.entities.AworkTaskSnapshot.filter({ is_done: true }, '-last_activity_at', l, o)
    );
    const erledigt = aufgaben.filter(t => projektById[t.awork_project_id]);
    const aufgabeById = {};
    erledigt.forEach(t => { aufgabeById[t.awork_task_id] = t; });

    // 3. Offene (noch nicht abgerechnete) Zeitbuchungen auf diese Aufgaben
    const buchungen = await alleSeiten((l, o) =>
      base44.asServiceRole.entities.AworkTimeEntry.filter({ is_billed: false, is_billable: true }, '-entry_date', l, o)
    );
    const offeneBuchungen = buchungen.filter(b =>
      b.task_id && aufgabeById[b.task_id] && (!since || (b.entry_date || '') >= since)
    );

    // 4. Bereits über dieses Modul abgerechnete Aufgaben ausschließen
    const anweisungen = await alleSeiten((l, o) =>
      base44.asServiceRole.entities.BillingInstruction.list('-created_date', l, o)
    );
    const abgerechneteTasks = new Set();
    const anweisungProProjekt = {};
    anweisungen.forEach(a => {
      let snap = null;
      try { snap = a.source_snapshot_json ? JSON.parse(a.source_snapshot_json) : null; } catch (_e) { snap = null; }
      const ids = snap?.support_task_ids || [];
      if (ids.length > 0 && a.status !== 'cancelled') {
        ids.forEach(id => abgerechneteTasks.add(id));
        (anweisungProProjekt[a.project_id] = anweisungProProjekt[a.project_id] || []).push(a);
      }
    });

    // 5. LiquidityProjects zur Verknüpfung (Kunde, project_id)
    const liquidity = await alleSeiten((l, o) =>
      base44.asServiceRole.entities.LiquidityProject.list('-updated_date', l, o)
    );
    const liqByAwork = {};
    liquidity.forEach(lp => { if (lp.awork_project_id) liqByAwork[lp.awork_project_id] = lp; });

    // 6. Aufgaben gruppieren
    const perTask = {};
    offeneBuchungen.forEach(b => {
      if (abgerechneteTasks.has(b.task_id)) return;
      const t = aufgabeById[b.task_id];
      const eintrag = perTask[b.task_id] || {
        awork_task_id: b.task_id,
        task_title: t.task_title || b.task_name || '',
        awork_project_id: t.awork_project_id,
        assignee_name: t.assignee_name || '',
        status_name: t.task_status_name || '',
        last_activity_at: t.last_activity_at || null,
        open_minutes: 0,
        entries: 0,
        last_entry_date: null,
      };
      eintrag.open_minutes += Number(b.duration_minutes) || 0;
      eintrag.entries += 1;
      if (!eintrag.last_entry_date || (b.entry_date || '') > eintrag.last_entry_date) eintrag.last_entry_date = b.entry_date || null;
      perTask[b.task_id] = eintrag;
    });

    // 7. Nach Projekt gruppieren
    const gruppen = {};
    Object.values(perTask).forEach(t => {
      const p = projektById[t.awork_project_id];
      const lp = liqByAwork[t.awork_project_id] || null;
      const g = gruppen[t.awork_project_id] || {
        awork_project_id: t.awork_project_id,
        project_name: p?.name || '',
        project_type: p?.project_type || '',
        customer_name: lp?.customer || p?.company_name || '',
        liquidity_project_id: lp?.id || null,
        responsible: p?.responsible_user_name || '',
        open_minutes: 0,
        tasks: [],
        instructions: [],
      };
      g.open_minutes += t.open_minutes;
      g.tasks.push(t);
      gruppen[t.awork_project_id] = g;
    });

    // 8. Rechnungsstand: Anweisungen dieses Projekts + Live-Status aus sevDesk
    const statusCache = {};
    async function liveStatus(sevdeskId) {
      if (!apiKey || !sevdeskId) return null;
      if (statusCache[sevdeskId] !== undefined) return statusCache[sevdeskId];
      let ergebnis = null;
      try {
        const res = await fetch(`${SEVDESK_BASE}/Invoice/${sevdeskId}`, {
          headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
        });
        if (res.ok) {
          const data = await res.json();
          const inv = (data.objects || [])[0];
          if (inv) {
            ergebnis = {
              invoice_number: inv.invoiceNumber || '',
              status_code: String(inv.status || ''),
              status_label: SEVDESK_STATUS[String(inv.status || '')] || `Status ${inv.status}`,
              gross_amount: parseFloat(inv.sumGross || '0') || 0,
            };
          }
        }
      } catch (_e) {
        ergebnis = null;
      }
      statusCache[sevdeskId] = ergebnis;
      return ergebnis;
    }

    for (const g of Object.values(gruppen)) {
      const liste = anweisungProProjekt[g.liquidity_project_id] || [];
      for (const a of liste) {
        const live = await liveStatus(a.sevdesk_invoice_id);
        g.instructions.push({
          id: a.id,
          amount_net: a.instruction_amount_net || 0,
          status: a.status,
          sevdesk_invoice_id: a.sevdesk_invoice_id || null,
          sevdesk_invoice_url: a.sevdesk_invoice_url || null,
          live_status: live,
        });
      }
    }

    const rows = Object.values(gruppen).sort((a, b) => b.open_minutes - a.open_minutes);

    return Response.json({
      success: true,
      support_projects_checked: supportProjekte.length,
      since,
      rows,
      total_open_minutes: rows.reduce((s, r) => s + r.open_minutes, 0),
      sevdesk_live: Boolean(apiKey),
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}