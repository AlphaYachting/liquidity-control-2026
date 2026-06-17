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

  // Fetch all relevant data in parallel
  const [
    project,
    orders,
    orderItems,
    aworkSnapshot,
    aworkTasks,
    timeEntries,
    pastInstructions,
    pastInvoices,
  ] = await Promise.all([
    base44.asServiceRole.entities.LiquidityProject.filter({ id: project_id }).then(r => r[0] || null),
    confirmed_order_id
      ? base44.asServiceRole.entities.ConfirmedOrder.filter({ id: confirmed_order_id })
      : base44.asServiceRole.entities.ConfirmedOrder.filter({ project_id }),
    base44.asServiceRole.entities.ConfirmedOrderItem.filter({ confirmed_order_id: confirmed_order_id || '' }),
    project_id
      ? base44.asServiceRole.entities.AworkProjectSnapshot.filter({ awork_project_id: '' }).then(() =>
          base44.asServiceRole.entities.LiquidityProject.filter({ id: project_id }).then(r => r[0]?.awork_project_id || null)
            .then(aworkId => aworkId
              ? base44.asServiceRole.entities.AworkProjectSnapshot.filter({ awork_project_id: aworkId }).then(r => r[0] || null)
              : null
            )
        )
      : Promise.resolve(null),
    base44.asServiceRole.entities.AworkTaskSnapshot.filter({ awork_project_id: '' }).then(() =>
      base44.asServiceRole.entities.LiquidityProject.filter({ id: project_id }).then(r => r[0]?.awork_project_id || null)
        .then(aworkId => aworkId
          ? base44.asServiceRole.entities.AworkTaskSnapshot.filter({ awork_project_id: aworkId })
          : []
        )
    ),
    base44.asServiceRole.entities.AworkTimeEntry.filter({ awork_project_id: '' }).then(() =>
      base44.asServiceRole.entities.LiquidityProject.filter({ id: project_id }).then(r => r[0]?.awork_project_id || null)
        .then(aworkId => aworkId
          ? base44.asServiceRole.entities.AworkTimeEntry.filter({ awork_project_id: aworkId })
          : []
        )
    ),
    base44.asServiceRole.entities.BillingInstruction.filter({ project_id }),
    base44.asServiceRole.entities.InvoiceRecord.filter({ project_id }),
  ]);

  const order = orders?.[0] || null;

  // Build context for the LLM
  const invoiceTypeLabel = { AZ: 'Anzahlung', TR: 'Teilrechnung', ER: 'Schlussrechnung' }[planned_invoice_type] || 'Teilrechnung';

  // Done tasks (for awork context)
  const doneTasks = (aworkTasks || []).filter(t => t.is_done || t.task_status_type === 'done');
  const openTasks = (aworkTasks || []).filter(t => !t.is_done && t.task_status_type !== 'done');
  const blockedTasks = (aworkTasks || []).filter(t => t.is_blocked || t.task_status_type === 'blocked');

  // Time entries grouped by type_of_work
  const timeByWork = {};
  for (const te of (timeEntries || [])) {
    const key = te.type_of_work_name || 'Allgemein';
    if (!timeByWork[key]) timeByWork[key] = 0;
    timeByWork[key] += te.duration_minutes || 0;
  }
  const topWorkTypes = Object.entries(timeByWork)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, mins]) => `${name}: ${Math.round(mins / 60 * 10) / 10}h`);

  // Previous billing reasons to avoid duplicates
  const prevReasons = pastInstructions
    .filter(i => i.status !== 'cancelled')
    .map(i => i.invoice_reason)
    .filter(Boolean);

  const prevInvoicesText = pastInvoices
    .filter(i => !i.is_credit_note && i.payment_status !== 'cancelled')
    .map(i => `${i.invoice_date || ''}: ${i.net_amount}€ (${i.invoice_type || ''}) — ${i.notes || ''}`)
    .join('\n');

  const prompt = `Du bist ein erfahrener Projektmanagement-Berater einer österreichischen Digitalagentur. Deine Aufgabe ist es, einen professionellen, präzisen und kundenseitlich plausiblen **Abrechnungsgrund für eine Teilrechnung** zu formulieren.

## Projektkontext

**Kunde:** ${project?.customer || order?.customer || '–'}
**Projekt:** ${project?.project_name || order?.project_name || '–'}
**Projektmanager:** ${project?.project_manager || '–'}
**Projektstatus:** ${project?.status || '–'}

## Auftragsbestätigung
${order ? `
- Auftragsnummer: ${order.order_number || '–'}
- Gesamtvolumen netto: ${order.total_net_amount?.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
- Beschreibung: ${order.description || '–'}
` : 'Keine Auftragsbestätigung verknüpft.'}

## Beauftragte Leistungspositionen (Auftragsbestätigung)
${orderItems?.length > 0
  ? orderItems.map(i => `- Pos. ${i.position || '?'}: ${i.title}${i.description ? ' — ' + i.description : ''} (${i.total_price?.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })})`).join('\n')
  : 'Keine Positionen erfasst.'}

## Aktuelle Abrechnung
- Rechnungstyp: **${invoiceTypeLabel}**
- Betrag netto: **${planned_amount_net?.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}**
- Anteil am Gesamtauftrag: **${Math.round(planned_percent || 0)}%**
- Geplanter Abrechnungsmonat: ${planning_month || '–'}

## awork Projektfortschritt
${aworkSnapshot ? `
- Fortschritt: ${aworkSnapshot.progress_percent || 0}%
- Zeitbudget: ${Math.round((aworkSnapshot.time_budget_minutes || 0) / 60)}h geplant
- Erfasste Zeit: ${Math.round((aworkSnapshot.tracked_duration_minutes || 0) / 60)}h
- Gesamtaufgaben: ${aworkSnapshot.tasks_count || 0} · Erledigt: ${aworkSnapshot.tasks_done_count || 0}
` : 'Kein awork-Snapshot verfügbar.'}

## Erledigte Aufgaben (awork) — ${doneTasks.length} Tasks
${doneTasks.length > 0
  ? doneTasks.slice(0, 20).map(t => `✅ ${t.task_title}${t.task_list_name ? ' [' + t.task_list_name + ']' : ''}${t.tracked_duration_minutes ? ' (' + Math.round(t.tracked_duration_minutes / 60 * 10) / 10 + 'h)' : ''}`).join('\n')
  : 'Keine erledigten Tasks gefunden.'}

## Offene Aufgaben (awork) — ${openTasks.length} Tasks
${openTasks.length > 0
  ? openTasks.slice(0, 10).map(t => `⏳ ${t.task_title}${t.task_list_name ? ' [' + t.task_list_name + ']' : ''}`).join('\n')
  : 'Keine offenen Tasks.'}

${blockedTasks.length > 0 ? `## Blockierte Aufgaben\n${blockedTasks.map(t => `⛔ ${t.task_title}`).join('\n')}\n` : ''}

## Zeiterfassung nach Tätigkeitsart (gesamt)
${topWorkTypes.length > 0 ? topWorkTypes.join('\n') : 'Keine Zeiterfassungsdaten.'}

## Bisherige Abrechnungshistorie
${prevReasons.length > 0
  ? prevReasons.map((r, i) => `Rechnung ${i + 1}: "${r}"`).join('\n')
  : 'Noch keine vorherigen Abrechnungen.'}

${prevInvoicesText ? `## Bereits gestellte Rechnungen\n${prevInvoicesText}\n` : ''}

## Deine Aufgabe

Formuliere einen **Abrechnungsgrund** (Freitext) für diese ${invoiceTypeLabel}, der:

1. **Konkret** die seit der letzten Abrechnung erbrachten Leistungen beschreibt (aus den erledigten awork-Tasks ableiten)
2. **Keine Duplikate** zu bisherigen Abrechnungsgründen enthält — neue, frische Meilensteine nennen
3. **Kundenseitig plausibel** ist — der Kunde soll verstehen, warum er jetzt bezahlen soll
4. **Professionell und prägnant** formuliert ist — max. 3-5 Sätze auf Deutsch
5. **Konkrete Tätigkeiten** aus den erledigten Tasks nennt, sofern vorhanden
6. **Den Fortschritt** im Verhältnis zum Gesamtauftrag widerspiegelt (${Math.round(planned_percent || 0)}%)

Antworte NUR mit dem Abrechnungsgrund-Text, ohne Überschriften, Anführungszeichen oder Erklärungen.`;

  const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
    prompt,
    model: 'claude_sonnet_4_6',
    response_json_schema: null,
  });

  return Response.json({ invoice_reason: result });
});