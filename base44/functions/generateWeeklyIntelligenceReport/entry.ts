import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { fetchLiveOpenReceivables } from '../../shared/sevdeskLiveReceivables.ts';

// Wochenvorschau der Projektintelligence — läuft donnerstags und schaut
// PROAKTIV in die NÄCHSTE Woche: erwartete Zahlungseingänge, geplante
// Abrechnungen, Quick-Wins, Budget-Risiken und offene Nachverfolgungen.
// Forderungszahlen kommen live aus sevDesk (Wahrheitsquelle),
// Zeiterfassung wird vollständig paginiert geladen.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const now = new Date();
    const today = now.toISOString().substring(0, 10);

    // Nächste Woche: Montag bis Sonntag nach dem heutigen Tag
    const dow = now.getUTCDay(); // 0=So
    const daysToNextMonday = ((8 - dow) % 7) || 7;
    const nextMonday = new Date(now.getTime() + daysToNextMonday * 86400000);
    const nextSunday = new Date(nextMonday.getTime() + 6 * 86400000);
    const weekStart = nextMonday.toISOString().substring(0, 10);
    const weekEnd = nextSunday.toISOString().substring(0, 10);
    const nextWeekMonth = weekStart.substring(0, 7);

    // 1. Live-Forderungen aus sevDesk (Wahrheitsquelle)
    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });
    const receivables = await fetchLiveOpenReceivables(apiKey);
    const overdue = receivables.filter(r => r.due_date && r.due_date < today);
    const dueNextWeek = receivables.filter(r => r.due_date && r.due_date >= weekStart && r.due_date <= weekEnd);
    const overdueSum = Math.round(overdue.reduce((s, r) => s + r.open_amount, 0));
    const dueNextWeekSum = Math.round(dueNextWeek.reduce((s, r) => s + r.open_amount, 0));

    // 2. Aktive Projekte + awork-Snapshots
    const projects = await svc.entities.LiquidityProject.filter({ is_active_for_billing: true }, null, 500);
    const aworkIds = projects.map(p => p.awork_project_id).filter(Boolean);
    const snapshots = aworkIds.length > 0
      ? await svc.entities.AworkProjectSnapshot.filter({ awork_project_id: { $in: aworkIds } }, null, 500)
      : [];
    const snapById: Record<string, any> = {};
    for (const s of snapshots) snapById[s.awork_project_id] = s;

    // 2b. Ist-Abrechnung je Projekt aus ECHTEN Rechnungen (Wahrheitsquelle) —
    // die Projektfelder already_invoiced_amount/open_amount sind oft veraltet.
    const projectIds = projects.map(p => p.id);
    const orders = await svc.entities.ConfirmedOrder.filter({ project_id: { $in: projectIds } }, null, 500);
    const orderToProject: Record<string, string> = {};
    for (const o of orders) orderToProject[o.id] = o.project_id;
    const [invByProject, invByOrder] = await Promise.all([
      svc.entities.InvoiceRecord.filter({ project_id: { $in: projectIds } }, null, 1000),
      orders.length > 0
        ? svc.entities.InvoiceRecord.filter({ confirmed_order_id: { $in: orders.map(o => o.id) } }, null, 1000)
        : Promise.resolve([]),
    ]);
    const seenInv = new Set<string>();
    const invoicedByProject: Record<string, number> = {};
    for (const i of [...invByProject, ...invByOrder]) {
      if (seenInv.has(i.id)) continue;
      seenInv.add(i.id);
      if (i.is_credit_note || i.payment_status === 'cancelled' || i.payment_status === 'draft') continue;
      const pid = i.project_id || orderToProject[i.confirmed_order_id];
      if (!pid) continue;
      invoicedByProject[pid] = (invoicedByProject[pid] || 0) + (i.net_amount || 0);
    }

    // 3. Offene verrechenbare Stunden — VOLLSTÄNDIG paginiert (kein Limit-Abschnitt)
    const openEntries: any[] = [];
    let skip = 0;
    while (true) {
      const page = await svc.entities.AworkTimeEntry.filter({ is_billable: true, is_billed: false }, null, 1000, skip);
      openEntries.push(...page);
      if (page.length < 1000) break;
      skip += 1000;
    }
    const openMinutes: Record<string, number> = {};
    const lastEntryDate: Record<string, string> = {};
    for (const e of openEntries) {
      if (!e.awork_project_id) continue;
      openMinutes[e.awork_project_id] = (openMinutes[e.awork_project_id] || 0) + (e.duration_minutes || 0);
      if (!lastEntryDate[e.awork_project_id] || (e.entry_date || '') > lastEntryDate[e.awork_project_id]) {
        lastEntryDate[e.awork_project_id] = e.entry_date || '';
      }
    }

    // 4. Kennzahlen je Projekt
    const twoWeeksAgo = new Date(now.getTime() - 14 * 86400000).toISOString().substring(0, 10);
    const rows = projects.map(p => {
      const snap = p.awork_project_id ? snapById[p.awork_project_id] : null;
      const total = p.total_net_amount || 0;
      // Echte Rechnungen schlagen das (oft veraltete) Projektfeld
      const invoiced = Math.max(p.already_invoiced_amount || 0, invoicedByProject[p.id] || 0);
      const openNet = Math.max(total - invoiced, 0);
      const billingPct = total > 0 ? Math.round((invoiced / total) * 100) : 0;
      const progress = (p.real_progress_percent > 0 ? p.real_progress_percent : null)
        ?? snap?.progress_percent ?? p.awork_progress_percent ?? 0;
      const budgetUtil = snap && snap.time_budget_minutes > 0
        ? Math.round((snap.tracked_duration_minutes / snap.time_budget_minutes) * 100)
        : null;
      const openHours = p.awork_project_id ? Math.round((openMinutes[p.awork_project_id] || 0) / 60) : 0;
      const stale = p.awork_project_id && openNet > 0 &&
        (!lastEntryDate[p.awork_project_id] || lastEntryDate[p.awork_project_id] < twoWeeksAgo);
      return {
        kunde: p.customer, projekt: p.project_name,
        auftrag_netto: total, abgerechnet_netto: Math.round(invoiced), offen_netto: Math.round(openNet),
        fortschritt_pct: Math.round(progress), abrechnung_pct: billingPct,
        luecke_pct: Math.round(progress - billingPct),
        budget_auslastung_pct: budgetUtil, offene_stunden: openHours,
        risiko: p.risk_status || 'none', stagniert: !!stale,
        notiz_naechste_rechnung: p.notes_next_invoice || '',
      };
    });

    const quickWins = rows.filter(r => r.luecke_pct > 20 && r.offen_netto > 0);
    const budgetCritical = rows.filter(r => r.budget_auslastung_pct !== null && r.budget_auslastung_pct > 100);
    const stagnating = rows.filter(r => r.stagniert);

    // 5. Geplante Abrechnungen für die nächste Woche / den Monat der nächsten Woche
    const instructions = await svc.entities.BillingInstruction.filter(
      { status: { $in: ['draft', 'ready_for_backoffice', 'sent_to_backoffice'] } }, null, 500);
    const plannedNextWeek = instructions.filter(i =>
      i.planned_invoice_date && i.planned_invoice_date >= weekStart && i.planned_invoice_date <= weekEnd);
    const monthPlans = await svc.entities.MonthlyBillingPlan.filter(
      { planning_month: nextWeekMonth, billing_status: { $in: ['open', 'planned', 'in_review', 'ready_for_invoice'] } }, null, 500);
    const plannedSum = Math.round(
      plannedNextWeek.reduce((s, i) => s + (i.instruction_amount_net || 0), 0) +
      monthPlans.reduce((s, p) => s + (p.planned_amount_net || 0), 0));

    // 6. Nachverfolgung
    const openRecs = await svc.entities.AdvisorRecommendation.filter({ status: 'open' }, null, 200).catch(() => []);
    const openInquiries = await svc.entities.ProjectInquiry.filter({ status: 'sent' }, null, 200).catch(() => []);

    // 7. Stundensatz
    const settings = await svc.entities.RestructuringSetting.list(null, 1).catch(() => []);
    const hourlyRate = settings[0]?.wip_blended_hourly_rate || 100;
    const totalOpenHours = rows.reduce((s, r) => s + r.offene_stunden, 0);

    const kpis = {
      woche_von: weekStart, woche_bis: weekEnd,
      zahlungseingaenge_naechste_woche: dueNextWeekSum,
      zahlungseingaenge_anzahl: dueNextWeek.length,
      geplante_abrechnungen_netto: plannedSum,
      quick_win_potenzial_netto: Math.round(quickWins.reduce((s, r) => s + r.offen_netto, 0)),
      quick_wins: quickWins.length,
      budget_kritisch: budgetCritical.length,
      stagnierend: stagnating.length,
      ueberfaellig_summe: overdueSum,
      ueberfaellig_anzahl: overdue.length,
      offene_stunden: totalOpenHours,
      offene_stunden_wert_netto: Math.round(totalOpenHours * hourlyRate),
      offene_empfehlungen: openRecs.length,
      unbeantwortete_rueckfragen: openInquiries.length,
    };

    // 8. Vorschau-Bericht generieren
    const fmtDate = (s: string) => new Date(s).toLocaleDateString('de-AT');
    const prompt = `Du bist die "Rittler und Co Projektintelligence" einer österreichischen Digitalagentur. Heute ist ${today}. Erstelle die WOCHENVORSCHAU für die NÄCHSTE Woche (${fmtDate(weekStart)} bis ${fmtDate(weekEnd)}) als kompaktes Markdown-Dokument auf Deutsch. Der Bericht ist ein proaktiver Arbeitsplan: WAS IST NÄCHSTE WOCHE ZU TUN — kein Rückblick.

Kennzahlen (bereits validiert, exakt so verwenden — NICHT neu berechnen oder runden): ${JSON.stringify(kpis)}

Rechnungen, die nächste Woche fällig werden (erwartete Zahlungseingänge, live aus sevDesk): ${JSON.stringify(dueNextWeek.slice(0, 15))}

Bereits überfällige Rechnungen (nächste Woche nachfassen/mahnen, live aus sevDesk, Top nach Betrag): ${JSON.stringify(overdue.sort((a, b) => b.open_amount - a.open_amount).slice(0, 10))}

Für nächste Woche geplante Abrechnungsanweisungen: ${JSON.stringify(plannedNextWeek.slice(0, 10).map(i => ({ kunde: i.customer_name, projekt: i.project_name, betrag_netto: i.instruction_amount_net, datum: i.planned_invoice_date, status: i.status })))}

Offene Monatsplanungen für ${nextWeekMonth}: ${JSON.stringify(monthPlans.slice(0, 10).map(p => ({ betrag_netto: p.planned_amount_net, status: p.billing_status, typ: p.planned_invoice_type })))}

Quick-Wins (Fortschritt deutlich vor Abrechnung — nächste Woche Rechnung stellen): ${JSON.stringify(quickWins.slice(0, 15))}

Budget-kritische Projekte (nächste Woche eingreifen): ${JSON.stringify(budgetCritical.slice(0, 10))}

Stagnierende Projekte (keine Zeitbuchung seit 14+ Tagen bei offenem Volumen): ${JSON.stringify(stagnating.slice(0, 10))}

Offene Empfehlungen aus Vorwochen: ${JSON.stringify(openRecs.slice(0, 10).map(r => ({ kunde: r.customer, projekt: r.project_name, empfehlung: r.recommendation_text, betrag: r.amount_net, seit: r.recommended_at })))}

Unbeantwortete Rückfragen an Umsetzer: ${JSON.stringify(openInquiries.slice(0, 10).map(q => ({ kunde: q.customer, projekt: q.project_name, empfaenger: q.recipient_name, seit: q.sent_at })))}

Struktur:
1. KPI-Zeile oben (erwartete Eingänge nächste Woche €, geplante Abrechnungen €, Quick-Win-Potenzial €, Überfällig €, offene Stunden mit €-Wert bei ${hourlyRate}€/h)
2. "💶 Erwartete Zahlungseingänge nächste Woche" — fällige Rechnungen mit Kunde, Betrag, Fälligkeit
3. "🧾 Nächste Woche Rechnung stellen" — geplante Anweisungen + Quick-Wins mit konkretem Betrag
4. "📞 Nachfassen & Mahnen" — überfällige Rechnungen mit Priorität
5. "🔴 Eingreifen" — Budget-kritische und stagnierende Projekte
6. "📋 Nachverfolgung" — offene Empfehlungen und unbeantwortete Rückfragen
7. "🎯 Top-3-Aufgaben für nächste Woche" — konkrete Handlungen mit Beträgen
Formatvorgaben (strikt einhalten):
- Jede Sektion beginnt mit einer "## "-Überschrift inkl. Emoji.
- Jede Auflistung ist eine Markdown-Tabelle (z.B. | Kunde | Projekt | Betrag | Fällig/Status |), sortiert nach Betrag absteigend.
- Beträge im Format €12.345 (netto, gerundet). In Quick-Win-Tabellen zusätzlich Spalten "Abgerechnet" und "Offen".
- Nach jeder Tabelle höchstens ein kurzer Hinweis-Satz.
- Leere Sektionen mit einem Satz abhandeln ("Keine Einträge").
- Die Top-3-Aufgaben als nummerierte Liste, beginnend mit fettem Aktionsverb und Betrag.
- Keine Einleitungs- oder Schlussabsätze, keine Floskeln, keine erfundenen Zahlen.`;

    const content = await svc.integrations.Core.InvokeLLM({ prompt });

    const record = await svc.entities.WeeklyIntelligenceReport.create({
      report_date: today,
      title: `Wochenvorschau ${fmtDate(weekStart)} – ${fmtDate(weekEnd)}`,
      content_markdown: typeof content === 'string' ? content : JSON.stringify(content),
      kpi_json: JSON.stringify(kpis),
      status: 'generated',
    });

    return Response.json({ success: true, report_id: record.id, kpis });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});