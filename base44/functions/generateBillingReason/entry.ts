import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const {
    project_id,
    confirmed_order_id,
    planned_amount_net,
    planned_percent,
    planned_invoice_type,
    planning_month,
  } = await req.json();

  // Step 1: Fetch project first to get awork_project_id
  const project = await base44.asServiceRole.entities.LiquidityProject.filter({ id: project_id }).then(r => r[0] || null);
  const aworkProjectId = project?.awork_project_id || null;

  // Step 2: Fetch everything else in parallel (now we have aworkProjectId)
  const [
    orders,
    orderItems,
    aworkSnapshot,
    aworkTasks,
    timeEntries,
    pastInstructions,
    pastInvoices,
  ] = await Promise.all([
    confirmed_order_id
      ? base44.asServiceRole.entities.ConfirmedOrder.filter({ id: confirmed_order_id })
      : base44.asServiceRole.entities.ConfirmedOrder.filter({ project_id }),
    confirmed_order_id
      ? base44.asServiceRole.entities.ConfirmedOrderItem.filter({ confirmed_order_id })
      : Promise.resolve([]),
    aworkProjectId
      ? base44.asServiceRole.entities.AworkProjectSnapshot.filter({ awork_project_id: aworkProjectId }).then(r => r[0] || null)
      : Promise.resolve(null),
    aworkProjectId
      ? base44.asServiceRole.entities.AworkTaskSnapshot.filter({ awork_project_id: aworkProjectId })
      : Promise.resolve([]),
    aworkProjectId
      ? base44.asServiceRole.entities.AworkTimeEntry.filter({ awork_project_id: aworkProjectId })
      : Promise.resolve([]),
    base44.asServiceRole.entities.BillingInstruction.filter({ project_id }),
    base44.asServiceRole.entities.InvoiceRecord.filter({ project_id }),
  ]);

  const order = orders?.[0] || null;
  const invoiceTypeLabel = { AZ: 'Anzahlung', TR: 'Teilrechnung', ER: 'Schlussrechnung' }[planned_invoice_type] || 'Teilrechnung';

  // Categorize tasks
  const doneTasks = aworkTasks.filter(t => t.is_done || t.task_status_type === 'done');
  const openTasks = aworkTasks.filter(t => !t.is_done && t.task_status_type !== 'done' && !t.is_blocked && t.task_status_type !== 'blocked');
  const blockedTasks = aworkTasks.filter(t => t.is_blocked || t.task_status_type === 'blocked');

  // Group done tasks by task list for better readability
  const doneByList = {};
  for (const t of doneTasks) {
    const list = t.task_list_name || 'Allgemein';
    if (!doneByList[list]) doneByList[list] = [];
    doneByList[list].push(t);
  }
  const doneTasksText = Object.entries(doneByList)
    .map(([list, tasks]) =>
      `**${list}:**\n` + tasks.slice(0, 15).map(t =>
        `  ✅ ${t.task_title}${t.tracked_duration_minutes ? ' (' + Math.round(t.tracked_duration_minutes / 60 * 10) / 10 + 'h)' : ''}`
      ).join('\n')
    ).join('\n\n');

  // Time entries grouped by type_of_work
  const timeByWork = {};
  for (const te of timeEntries) {
    const key = te.type_of_work_name || 'Allgemein';
    if (!timeByWork[key]) timeByWork[key] = 0;
    timeByWork[key] += te.duration_minutes || 0;
  }
  const topWorkTypes = Object.entries(timeByWork)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, mins]) => `${name}: ${Math.round(mins / 60 * 10) / 10}h`);

  // Previous billing reasons (avoid duplicates)
  const prevReasons = pastInstructions
    .filter(i => i.status !== 'cancelled')
    .map(i => i.invoice_reason)
    .filter(Boolean);

  const prevInvoicesText = pastInvoices
    .filter(i => !i.is_credit_note && i.payment_status !== 'cancelled')
    .map(i => `${i.invoice_date || ''}: ${(i.net_amount || 0).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })} (${i.invoice_type || ''})${i.notes ? ' — ' + i.notes : ''}`)
    .join('\n');

  const prompt = `Du bist ein erfahrener Projektmanagement-Berater einer österreichischen Digitalagentur. Formuliere einen professionellen, präzisen und kundenseitig plausiblen **Abrechnungsgrund für eine Teilrechnung** auf Deutsch.

## Projektkontext
**Kunde:** ${project?.customer || order?.customer || '–'}
**Projekt:** ${project?.project_name || order?.project_name || '–'}
**Projektmanager:** ${project?.project_manager || '–'}
**Projektstatus:** ${project?.status || '–'}

## Auftragsbestätigung
${order
  ? `- Auftragsnummer: ${order.order_number || '–'}
- Gesamtvolumen netto: ${(order.total_net_amount || 0).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
- Beschreibung: ${order.description || '–'}`
  : 'Keine Auftragsbestätigung verknüpft.'}

## Beauftragte Leistungspositionen
${orderItems?.length > 0
  ? orderItems.map(i => `- Pos. ${i.position || '?'}: ${i.title}${i.description ? ' — ' + i.description : ''} (${(i.total_price || 0).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })})`).join('\n')
  : 'Keine Positionen erfasst.'}

## Aktuelle Abrechnung
- Rechnungstyp: **${invoiceTypeLabel}**
- Betrag netto: **${(planned_amount_net || 0).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}**
- Anteil am Gesamtauftrag: **${Math.round(planned_percent || 0)}%**
- Geplanter Abrechnungsmonat: ${planning_month || '–'}

## awork Projektfortschritt
${aworkSnapshot
  ? `- Gesamtfortschritt: ${aworkSnapshot.progress_percent || 0}%
- Zeitbudget: ${Math.round((aworkSnapshot.time_budget_minutes || 0) / 60)}h geplant / ${Math.round((aworkSnapshot.tracked_duration_minutes || 0) / 60)}h erfasst
- Aufgaben gesamt: ${aworkSnapshot.tasks_count || 0} · Erledigt: ${aworkSnapshot.tasks_done_count || 0}`
  : 'Kein awork-Snapshot verfügbar.'}

## Erledigte Aufgaben aus awork (${doneTasks.length} Tasks) — WICHTIGSTE GRUNDLAGE FÜR DEN ABRECHNUNGSGRUND
${doneTasks.length > 0 ? doneTasksText : 'Keine erledigten Tasks in awork gefunden.'}

## Noch offene Aufgaben (${openTasks.length} Tasks)
${openTasks.length > 0
  ? openTasks.slice(0, 8).map(t => `⏳ ${t.task_title}${t.task_list_name ? ' [' + t.task_list_name + ']' : ''}`).join('\n')
  : 'Keine offenen Tasks.'}

${blockedTasks.length > 0 ? `## Blockierte Aufgaben (${blockedTasks.length})\n${blockedTasks.map(t => `⛔ ${t.task_title}`).join('\n')}\n` : ''}

## Zeiterfassung nach Tätigkeitsart (Projektgesamt)
${topWorkTypes.length > 0 ? topWorkTypes.join('\n') : 'Keine Zeiterfassungsdaten verfügbar.'}

## Bisherige Abrechnungsgründe (NICHT WIEDERHOLEN!)
${prevReasons.length > 0
  ? prevReasons.map((r, i) => `Rechnung ${i + 1}: "${r}"`).join('\n')
  : 'Noch keine vorherigen Abrechnungen — dies ist die erste Rechnung.'}

${prevInvoicesText ? `## Bereits gestellte Rechnungen\n${prevInvoicesText}\n` : ''}

## Deine Aufgabe

Schreibe einen **Abrechnungsgrund** der:
1. Die **konkret erledigten awork-Tasks** als Leistungsnachweis nutzt — nenne 3-6 spezifische, abgeschlossene Tätigkeiten aus der Liste oben
2. **Keine Leistungen wiederholt**, die bereits in bisherigen Abrechnungsgründen erwähnt wurden
3. Den **Fortschritt im Verhältnis zum Gesamtauftrag** widerspiegelt (${Math.round(planned_percent || 0)}% dieser Abrechnung)
4. **Kundenseitig verständlich** ist — konkret, nicht zu technisch, nachvollziehbar warum jetzt abgerechnet wird
5. **Professionell und prägnant** ist — 3-5 Sätze, fließender Prosatext auf Deutsch

Antworte NUR mit dem fertigen Abrechnungsgrund-Text. Keine Überschriften, keine Anführungszeichen, keine Erklärungen.`;

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    model: 'claude_sonnet_4_6',
  });

  return Response.json({ invoice_reason: result });
});