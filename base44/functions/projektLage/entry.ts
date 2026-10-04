import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ladeStichtag, heuteWien } from '../../shared/kontingentLaufzeit.js';
import { aworkDbBereit, aworkLageSummen } from '../../shared/aworkDb.ts';

// Projektlage — die eine Rechenstelle der Projektintelligenz.
// Führt den eingefrorenen aWork-Altstand (bis Stichtag) mit den Buchungen und
// Aufgaben der App (nach dem Stichtag) zusammen und sagt: läuft das Projekt im Plan,
// wohin läuft es beim aktuellen Tempo, und was davon ist Mehrleistung.
// Der aWork-Altstand kommt vollständig aus der externen aWork-Sicherung, ersatzweise aus den Kopien in der App.
// Schreibt nichts. Eurowerte nur für Personen mit Finanzrecht.
const TAG = 86400000;
const r1 = (v) => Math.round((Number(v) || 0) * 10) / 10;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);

async function alleSeiten(holen) {
  const out = [];
  let skip = 0;
  while (true) {
    const page = await holen(500, skip);
    out.push(...page);
    if (page.length < 500 || skip > 20000) break;
    skip += 500;
  }
  return out;
}

async function hatFinanzrecht(svc, user) {
  if (user.role === 'admin') return true;
  const [member, profil] = await Promise.all([
    svc.entities.TeamMember.filter({ email: user.email }, 'name', 1).catch(() => []),
    svc.entities.TeamMemberProfile.filter({ user_email: user.email }, '-created_date', 1).catch(() => []),
  ]);
  if (member[0]?.active !== false && member[0]?.system_role === 'gf') return true;
  const bereiche = profil[0]?.work_areas || [];
  return bereiche.includes('backoffice') || bereiche.includes('management');
}

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const svc = base44.asServiceRole;
    const db = svc.entities;

    // 1. Projekt und Cockpit auflösen — egal von welcher Seite der Aufruf kommt
    let project = null;
    let liq = null;
    if (body.project_id) {
      project = await db.Project.get(body.project_id).catch(() => null);
      if (!project) liq = await db.LiquidityProject.get(body.project_id).catch(() => null);
    }
    if (!liq && body.liquidity_project_id) liq = await db.LiquidityProject.get(body.liquidity_project_id).catch(() => null);
    if (project && !liq && project.liquidity_project_id) {
      liq = await db.LiquidityProject.get(project.liquidity_project_id).catch(() => null);
    }
    if (!project && liq) {
      project = (await db.Project.filter({ liquidity_project_id: liq.id }, '-created_date', 1))[0] || null;
      if (!project && liq.awork_project_id) {
        project = (await db.Project.filter({ awork_project_id: liq.awork_project_id }, '-created_date', 1))[0] || null;
      }
    }
    if (!project && !liq) return Response.json({ error: 'Projekt nicht gefunden' }, { status: 404 });

    const aworkId = project?.awork_project_id || liq?.awork_project_id || null;
    const [stichtag, finanz] = await Promise.all([ladeStichtag(db), hatFinanzrecht(svc, user)]);
    const heute = heuteWien();

    // 2. Daten laden
    const [archiv, aworkAufgabenRoh, aworkZeiten, snapshotRows, appZeitenAlle, tickets, sprints, auftraegeRoh, satzRows, changeRequests, client] = await Promise.all([
      // Vollständige Summen aus der externen aWork-Sicherung — fällt sie aus, tragen die Kopien in der App
      aworkId && aworkDbBereit() ? aworkLageSummen(aworkId).catch(() => null) : null,
      aworkId ? db.AworkTaskSnapshot.filter({ awork_project_id: aworkId }, '-last_synced_at', 1000).catch(() => []) : [],
      aworkId ? alleSeiten((l, s) => db.AworkTimeEntry.filter({ awork_project_id: aworkId }, '-entry_date', l, s)) : [],
      aworkId ? db.AworkProjectSnapshot.filter({ awork_project_id: aworkId }, '-last_synced_at', 1) : [],
      project ? alleSeiten((l, s) => db.TimeEntry.filter({ project_id: project.id }, '-entry_date', l, s)) : [],
      project ? db.Ticket.filter({ project_id: project.id, archiviert: { $ne: true } }, 'order', 3000) : [],
      project ? db.Sprint.filter({ project_id: project.id }, 'start_date', 100) : [],
      Promise.all([...new Set([liq?.id, project?.id].filter(Boolean))]
        .map((id) => db.ConfirmedOrder.filter({ project_id: id }, '-created_date', 50).catch(() => []))),
      db.Setting.filter({ key: 'standard_stundensatz' }, '-updated_date', 1).catch(() => []),
      project ? db.ChangeRequest.filter({ project_id: project.id }, '-created_date', 200).catch(() => []) : [],
      project?.client_id ? db.Client.get(project.client_id).catch(() => null) : null,
    ]);
    const snapshot = snapshotRows[0] || null;

    // Bis einschliesslich Stichtag zählt aWork, danach die App. Projekte ohne aWork-Herkunft zählen ganz in der App.
    const appZeiten = appZeitenAlle.filter((e) => {
      if (e.abrechnungsstatus === 'verworfen') return false;
      const d = String(e.entry_date || '').slice(0, 10);
      return aworkId ? d > stichtag : true;
    });
    const minApp = (e) => Number(e.duration_minutes) || (Number(e.hours) || 0) * 60;

    // 3. Ist-Stunden
    // Die aWork-Zeitbuchungen in der App beginnen erst im April 2026. Für ältere Projekte trägt der
    // Aufgabenstand (gebuchte Minuten je Aufgabe) die vollständigere Summe — es zählt der höhere Wert.
    const aworkBuchungenMin = aworkZeiten.reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);
    const aufgabenStandTag = aworkAufgabenRoh.reduce((max, t) => ((t.last_synced_at || '') > max ? t.last_synced_at : max), '').slice(0, 10);
    const aufgabenMin = aworkAufgabenRoh.reduce((s, t) => s + (Number(t.tracked_duration_minutes) || 0), 0)
      + (aufgabenStandTag ? aworkZeiten.filter((e) => String(e.entry_date || '').slice(0, 10) > aufgabenStandTag)
        .reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0) : 0);
    const projektstandMin = Number(snapshot?.tracked_duration_minutes) || 0;
    // Sicherung: alle Buchungen bis zu ihrem letzten Tag, dazu aus der App-Kopie, was danach noch in aWork gebucht wurde
    const sicherungBis = archiv?.sicherung_bis ? String(archiv.sicherung_bis).slice(0, 10) : null;
    const archivMin = archiv ? (Number(archiv.sekunden) || 0) / 60
      + aworkZeiten.filter((e) => sicherungBis && String(e.entry_date || '').slice(0, 10) > sicherungBis)
        .reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0) : 0;
    const aworkMin = Math.max(archivMin, aworkBuchungenMin, aufgabenMin, projektstandMin);
    const aworkQuelle = archiv && aworkMin === archivMin ? `aWork-Sicherung (Buchungen bis ${sicherungBis}) plus spätere aWork-Buchungen aus der App-Kopie`
      : aworkMin === aworkBuchungenMin ? 'aWork-Zeitbuchungen (App-Kopie)'
      : aworkMin === aufgabenMin ? `aWork-Aufgabenstand vom ${aufgabenStandTag} plus Buchungen danach` : 'aWork-Projektstand';
    const appMin = appZeiten.reduce((s, e) => s + minApp(e), 0);
    const istStunden = (aworkMin + appMin) / 60;

    const tage = [
      ...aworkZeiten.map((e) => ({ d: String(e.entry_date || '').slice(0, 10), m: Number(e.duration_minutes) || 0 })),
      ...appZeiten.map((e) => ({ d: String(e.entry_date || '').slice(0, 10), m: minApp(e) })),
    ].filter((x) => x.d);
    const letzteBuchung = tage.reduce((max, x) => (x.d > max ? x.d : max), '') || null;
    const ersteApp = tage.reduce((min, x) => (!min || x.d < min ? x.d : min), '') || null;
    const ersteArchiv = archiv?.erste ? String(archiv.erste).slice(0, 10) : null;
    const ersteBuchung = [ersteApp, ersteArchiv].filter(Boolean).sort()[0] || null;
    const tageSeitBuchung = letzteBuchung ? Math.floor((new Date(heute) - new Date(letzteBuchung)) / TAG) : null;
    const vor = (n) => new Date(new Date(heute).getTime() - n * TAG).toISOString().slice(0, 10);
    const d28 = vor(28), d56 = vor(56);
    const std28 = tage.filter((x) => x.d > d28).reduce((s, x) => s + x.m, 0) / 60;
    const std28davor = tage.filter((x) => x.d > d56 && x.d <= d28).reduce((s, x) => s + x.m, 0) / 60;
    const wochenTempo = std28 / 4;

    // 4. Mehrleistung und Nicht-Verrechenbares (nur App-Daten tragen diese Kennzeichen)
    const ticketNachId = Object.fromEntries(tickets.map((t) => [t.id, t]));
    let mehrMin = 0, nichtVerrMin = 0, ohneTicketMin = 0, ueberKontingentMin = 0;
    const nichtVerrGruende = {};
    for (const e of appZeiten) {
      const m = minApp(e);
      const t = e.ticket_id ? ticketNachId[e.ticket_id] : null;
      if (!e.ticket_id) ohneTicketMin += m;
      if (e.mehrleistung === true || t?.origin === 'change_request') mehrMin += m;
      if (e.ueber_kontingent === true) ueberKontingentMin += m;
      if (e.verrechenbar === false) {
        nichtVerrMin += m;
        const g = e.nicht_verrechenbar_grund || 'ohne_grund';
        nichtVerrGruende[g] = r1((nichtVerrGruende[g] || 0) + m / 60);
      }
    }
    const zusatzTickets = tickets.filter((t) => t.origin === 'change_request');

    // 5. Aufgabenfortschritt — nach Sollstunden gewichtet, wenn sie gepflegt sind
    const arbeitsTickets = tickets.filter((t) => !t.rhythmus);
    const erledigt = arbeitsTickets.filter((t) => t.status === 'erledigt');
    const sollGesamt = arbeitsTickets.reduce((s, t) => s + (Number(t.target_hours) || 0), 0);
    const sollErledigt = erledigt.reduce((s, t) => s + (Number(t.target_hours) || 0), 0);
    const gewichtet = sollGesamt > 0 && arbeitsTickets.filter((t) => Number(t.target_hours) > 0).length >= arbeitsTickets.length * 0.6;
    let fortschritt = gewichtet ? sollErledigt / sollGesamt
      : arbeitsTickets.length ? erledigt.length / arbeitsTickets.length : null;
    let fortschrittQuelle = gewichtet ? 'Aufgaben nach Sollstunden' : arbeitsTickets.length ? 'Anzahl erledigter Aufgaben' : null;
    let aufgabenErledigt = erledigt.length;
    let aufgabenGesamt = arbeitsTickets.length;

    // Altprojekte: in die App wurden nur die noch offenen aWork-Aufgaben übernommen.
    // Was in aWork schon erledigt war, zählt als Altstand mit — ohne Verwaltungslisten (Verrechnung, Organisation).
    const aworkAufgaben = aworkAufgabenRoh.filter((t) => !/verrechnung|organisation/i.test(t.task_list_name || ''));
    const aworkErledigt = aworkAufgaben.filter((t) => t.is_done === true);
    const aworkAufgabenStand = aworkAufgabenRoh.reduce((max, t) => ((t.last_synced_at || '') > max ? t.last_synced_at : max), '').slice(0, 10) || null;
    // Die Sicherung kennt den vollständigen Aufgabenstand; die App-Kopie ist nur der Rückfall.
    const ausArchiv = !!archiv && Number(archiv.aufgaben) > 0;
    const altErledigtN = ausArchiv ? Number(archiv.erledigt) || 0 : aworkErledigt.length;
    const altGesamtN = ausArchiv ? Number(archiv.aufgaben) : aworkAufgaben.length;
    const altErledigtSoll = ausArchiv ? (Number(archiv.erledigt_plan_sekunden) || 0) / 3600
      : aworkErledigt.reduce((s, t) => s + (Number(t.planned_duration_minutes) || 0), 0) / 60;
    const altStand = ausArchiv ? `aWork-Sicherung, Stand ${sicherungBis}` : `App-Kopie, Stand ${aworkAufgabenStand}`;
    if (altGesamtN) {
      if (arbeitsTickets.length) {
        aufgabenErledigt = altErledigtN + erledigt.length;
        aufgabenGesamt = altErledigtN + arbeitsTickets.length;
        const sE = altErledigtSoll + sollErledigt;
        const sG = altErledigtSoll + sollGesamt;
        fortschritt = gewichtet && sG > 0 ? sE / sG : aufgabenErledigt / aufgabenGesamt;
        fortschrittQuelle = `${gewichtet ? 'Sollstunden' : 'Anzahl'}: in aWork erledigt (${altStand}) + Aufgaben der App`;
      } else {
        aufgabenErledigt = altErledigtN;
        aufgabenGesamt = altGesamtN;
        fortschritt = aufgabenErledigt / aufgabenGesamt;
        fortschrittQuelle = `aWork-Altstand (eingefroren; ${altStand})`;
      }
    } else if (fortschritt === null && Number(snapshot?.tasks_count) > 0) {
      fortschritt = Number(snapshot.tasks_done_count) / Number(snapshot.tasks_count);
      aufgabenErledigt = Number(snapshot.tasks_done_count); aufgabenGesamt = Number(snapshot.tasks_count);
      fortschrittQuelle = 'aWork-Projektstand (eingefroren)';
    }

    // 6. Massstab: Planstunden und Auftragswert
    const modell = project?.abrechnungsmodell || liq?.abrechnungsmodell || 'unbekannt';
    const istPauschal = modell === 'sprint' || modell === 'pauschal';
    const auftraege = auftraegeRoh.flat().filter((o, i, a) => o.status !== 'cancelled' && a.findIndex((x) => x.id === o.id) === i);
    const auftragNetto = auftraege.reduce((s, o) => s + (Number(o.total_net_amount) || 0), 0)
      || Number(project?.total_budget) || Number(liq?.total_net_amount) || 0;
    const satz = Number(project?.stundensatz) || Number(satzRows[0]?.value) || 120;
    const satzQuelle = Number(project?.stundensatz) ? 'Projekt' : 'Standard-Stundensatz';

    const sprintSoll = sprints.reduce((s, sp) => s + (Number(sp.target_hours) || 0), 0);
    const snapshotSoll = (Number(snapshot?.time_budget_minutes) || 0) / 60 || (Number(archiv?.budget_sekunden) || 0) / 3600;
    let planStunden = 0, planQuelle = null;
    if (Number(project?.target_hours) > 0) { planStunden = Number(project.target_hours); planQuelle = 'Planstunden am Projekt'; }
    else if (sprintSoll > 0) { planStunden = sprintSoll; planQuelle = 'Sollstunden der Sprints'; }
    else if (snapshotSoll > 0) { planStunden = snapshotSoll; planQuelle = 'Zeitbudget aus aWork'; }
    else if (istPauschal && auftragNetto > 0) { planStunden = auftragNetto / satz; planQuelle = `abgeleitet: Auftragswert ÷ ${satz} EUR (${satzQuelle})`; }
    // Planwert offensichtlich ungepflegt (Ist mehr als das Zehnfache)
    const planUngepflegt = planStunden > 0 && istStunden > 10 * planStunden;

    // 7. Prognose
    const rest = planStunden > 0 ? planStunden - istStunden : null;
    const prognoseGesamt = fortschritt && fortschritt >= 0.1 && fortschritt < 1 ? istStunden / fortschritt : null;
    const wochenBisBudgetEnde = rest !== null && rest > 0 && wochenTempo > 0 ? rest / wochenTempo : null;
    const laufend = sprints.filter((s) => ['laufend', 'geplant'].includes(s.status) && s.delivery_date)
      .sort((a, b) => a.delivery_date.localeCompare(b.delivery_date))[0] || null;
    const liefertermin = laufend?.delivery_date || snapshot?.due_date?.slice?.(0, 10) || null;
    const tageBisLieferung = liefertermin ? Math.round((new Date(liefertermin) - new Date(heute)) / TAG) : null;

    // 8. Ampel mit Begründung
    const gruende = [];
    let ampel = 'gruen';
    const auslastung = planStunden > 0 && !planUngepflegt ? pct(istStunden, planStunden) : null;
    const fPct = fortschritt === null ? null : Math.round(fortschritt * 100);
    const hoch = (stufe) => { if (stufe === 'rot' || (stufe === 'gelb' && ampel === 'gruen')) ampel = stufe; };

    if (modell === 'paket') {
      const kont = Number(project?.support_kontingent_stunden) || 0;
      const monat = heute.slice(0, 7);
      const stdMonat = tage.filter((x) => x.d.startsWith(monat)).reduce((s, x) => s + x.m, 0) / 60;
      if (!kont) { ampel = 'kein_massstab'; gruende.push('Retainer ohne hinterlegtes Monatskontingent.'); }
      else {
        if (stdMonat > kont) { hoch('rot'); gruende.push(`Monatskontingent überschritten: ${r1(stdMonat)} von ${kont} Std.`); }
        else if (stdMonat > 0.8 * kont) { hoch('gelb'); gruende.push(`${pct(stdMonat, kont)} % des Monatskontingents verbraucht (${r1(stdMonat)} von ${kont} Std.).`); }
        else gruende.push(`Monat: ${r1(stdMonat)} von ${kont} Std. Der Saldo seit Laufzeitbeginn steht im Projektkopf.`);
      }
    } else if (modell === 'aufwand' || modell === 'support') {
      const rahmen = Number(project?.support_kontingent_stunden) || 0;
      const monat = heute.slice(0, 7);
      const stdMonat = tage.filter((x) => x.d.startsWith(monat)).reduce((s, x) => s + x.m, 0) / 60;
      if (rahmen && stdMonat > rahmen) { hoch('rot'); gruende.push(`Monatsrahmen überschritten: ${r1(stdMonat)} von ${rahmen} Std. — mit dem Kunden abstimmen.`); }
      else if (rahmen && stdMonat > 0.8 * rahmen) { hoch('gelb'); gruende.push(`${pct(stdMonat, rahmen)} % des Monatsrahmens verbraucht.`); }
      else gruende.push('Abrechnung nach Aufwand — Mehrstunden sind Umsatz, entscheidend ist, dass sie verrechnet werden.');
    } else if (modell === 'intern') {
      ampel = 'kein_massstab'; gruende.push('Internes Projekt — kein Budgetmassstab.');
    } else if (!planStunden) {
      ampel = 'kein_massstab'; gruende.push('Weder Planstunden noch Auftragswert hinterlegt — ohne Massstab keine Aussage.');
    } else if (planUngepflegt) {
      ampel = 'kein_massstab'; gruende.push(`Planwert offensichtlich nicht gepflegt (${r1(istStunden)} Std. gebucht bei ${r1(planStunden)} Std. Plan).`);
    } else {
      if (istStunden > planStunden) { hoch('rot'); gruende.push(`Budget überzogen: ${r1(istStunden)} von ${r1(planStunden)} Std. (${auslastung} %), ${r1(istStunden - planStunden)} Std. über Plan.`); }
      else if (prognoseGesamt && prognoseGesamt > planStunden * 1.1) {
        hoch(prognoseGesamt > planStunden * 1.25 ? 'rot' : 'gelb');
        gruende.push(`Läuft in die Überziehung: ${auslastung} % der Stunden verbraucht bei ${fPct} % Fortschritt — Hochrechnung ${r1(prognoseGesamt)} Std. bei ${r1(planStunden)} Std. Plan.`);
      } else if (auslastung > 80 && fPct !== null && fPct < 60) { hoch('gelb'); gruende.push(`${auslastung} % der Stunden verbraucht, aber erst ${fPct} % der Aufgaben erledigt.`); }
      else gruende.push(`${auslastung} % der Planstunden verbraucht${fPct !== null ? `, ${fPct} % Fortschritt` : ''}.`);
      if (wochenBisBudgetEnde !== null && wochenBisBudgetEnde < 4 && (fPct === null || fPct < 85)) {
        hoch('gelb'); gruende.push(`Beim aktuellen Tempo (${r1(wochenTempo)} Std./Woche) ist das Restbudget in ${r1(wochenBisBudgetEnde)} Wochen verbraucht.`);
      }
    }
    if (tageBisLieferung !== null && tageBisLieferung < 0 && (fPct === null || fPct < 100)) {
      hoch('rot'); gruende.push(`Liefertermin ${liefertermin} seit ${-tageBisLieferung} Tagen überschritten.`);
    } else if (tageBisLieferung !== null && tageBisLieferung <= 14 && fPct !== null && fPct < 70) {
      hoch('gelb'); gruende.push(`Noch ${tageBisLieferung} Tage bis zum Liefertermin bei ${fPct} % Fortschritt.`);
    }
    if (project?.status === 'aktiv' && tageSeitBuchung !== null && tageSeitBuchung >= 21 && modell !== 'paket') {
      hoch('gelb'); gruende.push(`Seit ${tageSeitBuchung} Tagen keine Zeitbuchung.`);
    }
    if (std28davor > 0 && std28 > std28davor * 1.5 && std28 >= 8) gruende.push(`Tempo zieht an: ${r1(std28)} Std. in den letzten 4 Wochen gegenüber ${r1(std28davor)} Std. davor.`);

    const stundenNach = (rows, key, min) => Object.entries(rows.reduce((acc, e) => {
      const k = e[key] || 'ohne Angabe'; acc[k] = (acc[k] || 0) + min(e); return acc;
    }, {})).map(([name, m]) => ({ name, stunden: r1(m / 60) })).sort((a, b) => b.stunden - a.stunden).slice(0, 8);

    const ergebnis = {
      projekt: {
        project_id: project?.id || null, liquidity_project_id: liq?.id || null, awork_project_id: aworkId,
        titel: project?.title || liq?.project_name || '', kunde: client?.name || liq?.customer || '',
        abrechnungsmodell: modell, altprojekt: project?.is_legacy === true, status: project?.status || liq?.status || null,
        cockpit_verknuepft: !!liq,
      },
      datenstand: {
        stichtag_awork: stichtag,
        regel: aworkId ? `aWork-Buchungen bis ${stichtag} (eingefroren), App-Buchungen danach` : 'nur App-Buchungen (kein aWork-Altstand)',
        awork_stunden: r1(aworkMin / 60), awork_stunden_quelle: aworkId ? aworkQuelle : null, app_stunden: r1(appMin / 60),
        awork_einzelbuchungen_stunden: r1(aworkBuchungenMin / 60),
        awork_sicherung_genutzt: !!archiv, awork_sicherung_bis: sicherungBis,
        hinweis_altdaten: !aworkId ? null : archiv
          ? 'aWork-Stunden und Aufgabenstand stammen aus der vollständigen aWork-Sicherung. Einzelnachweise (Buchungen, Kommentare, Aufgabenverlauf) liefert die Funktion aworkArchivApi.'
          : 'aWork-Sicherung nicht erreichbar — Rückfall auf die Kopien in der App: Einzelbuchungen erst ab April 2026, ältere Stunden nur als Summe je Aufgabe. Der Altstand kann zu niedrig sein.',
        awork_aufgaben_stand: aworkAufgabenStand,
        erste_buchung: ersteBuchung, letzte_buchung: letzteBuchung, tage_seit_letzter_buchung: tageSeitBuchung,
      },
      plan: {
        plan_stunden: planStunden ? r1(planStunden) : null, plan_quelle: planQuelle, plan_ungepflegt: planUngepflegt,
        ist_stunden: r1(istStunden), auslastung_pct: auslastung, rest_stunden: rest === null ? null : r1(rest),
        fortschritt_pct: fPct, fortschritt_quelle: fortschrittQuelle,
        aufgaben_erledigt: aufgabenErledigt, aufgaben_gesamt: aufgabenGesamt,
      },
      prognose: {
        stunden_letzte_4_wochen: r1(std28), stunden_4_wochen_davor: r1(std28davor), stunden_pro_woche: r1(wochenTempo),
        hochrechnung_gesamt_stunden: prognoseGesamt ? r1(prognoseGesamt) : null,
        hochrechnung_ueber_plan_stunden: prognoseGesamt && planStunden ? r1(prognoseGesamt - planStunden) : null,
        wochen_bis_budget_verbraucht: wochenBisBudgetEnde === null ? null : r1(wochenBisBudgetEnde),
        liefertermin, tage_bis_liefertermin: tageBisLieferung,
        hinweis: 'Hochrechnung = Ist-Stunden ÷ Fortschritt. Schätzung, kein Beleg.',
      },
      mehrleistung: {
        stunden_als_mehrleistung_gebucht: r1(mehrMin / 60),
        zusatzwunsch_tickets: zusatzTickets.map((t) => ({ titel: t.title, status: t.status, soll_stunden: t.target_hours || null })).slice(0, 20),
        change_requests: changeRequests.map((c) => ({ beschreibung: c.description, status: c.status, stunden: c.proposed_hours || null })).slice(0, 20),
        nicht_verrechenbar_stunden: r1(nichtVerrMin / 60), nicht_verrechenbar_nach_grund: nichtVerrGruende,
        ueber_kontingent_stunden: r1(ueberKontingentMin / 60),
        app_stunden_ohne_aufgabe: r1(ohneTicketMin / 60),
        hinweis: 'Mehrleistung ist nur für App-Buchungen gekennzeichnet. Für die Zeit vor dem Stichtag: aWork-Aufgaben, Kundenakt und E-Mails heranziehen.',
      },
      zeit_nach_person: [
        ...stundenNach(aworkZeiten, 'user_name', (e) => Number(e.duration_minutes) || 0).map((x) => ({ ...x, quelle: 'aWork' })),
        ...stundenNach(appZeiten, 'person_email', minApp).map((x) => ({ ...x, quelle: 'App' })),
      ],
      groesste_zeitfresser_awork: stundenNach(aworkZeiten, 'task_name', (e) => Number(e.duration_minutes) || 0),
      ampel, gruende,
    };

    // Deckung zählt für die Ampel bei allen gleich — Eurobeträge sehen nur Personen mit Finanzrecht.
    const istWert = istStunden * satz;
    if (istPauschal && auftragNetto > 0 && istWert > auftragNetto && !planUngepflegt) {
      ergebnis.ampel = 'rot';
      ergebnis.gruende.push(finanz
        ? `Bewerteter Aufwand ${Math.round(istWert)} EUR netto liegt über dem Auftragswert ${Math.round(auftragNetto)} EUR netto (${satz} EUR/Std.).`
        : 'Der bewertete Aufwand liegt über dem Auftragswert.');
    }
    if (finanz) {
      ergebnis.euro = {
        auftragswert_netto: Math.round(auftragNetto), stundensatz: satz, stundensatz_quelle: satzQuelle,
        ist_aufwand_bewertet_netto: Math.round(istWert),
        deckung_pct: istPauschal && auftragNetto > 0 ? pct(istWert, auftragNetto) : null,
        ueberdeckung_netto: istPauschal && auftragNetto > 0 ? Math.round(istWert - auftragNetto) : null,
        hinweis: istPauschal
          ? 'Pauschalprojekt: bewerteter Aufwand über dem Auftragswert ist Margenverlust, solange keine Mehrleistung beauftragt ist.'
          : 'Kein Pauschalprojekt — Deckung nicht bewertet.',
      };
    }

    // Blick nach vorn: Was vor der Umstellung war, ist Vergangenheit. Ab dem Stichtag zählt,
    // ob der Rest wirtschaftlich fertig wird — was ist noch zu tun, und was ist dafür noch zu bekommen.
    if (istPauschal && auftragNetto > 0) {
      const auftragIds = auftraege.map((o) => o.id);
      const rechnungen = (await Promise.all([
        liq ? db.InvoiceRecord.filter({ project_id: liq.id }, '-invoice_date', 500).catch(() => []) : [],
        auftragIds.length ? db.InvoiceRecord.filter({ confirmed_order_id: { $in: auftragIds } }, '-invoice_date', 500).catch(() => []) : [],
      ])).flat().filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i)
        .filter((r) => r.is_sent === true && !['draft', 'cancelled'].includes(r.payment_status));
      const abgerechnet = rechnungen.reduce((s, r) => s + (Number(r.net_amount) || 0), 0);
      const offenNetto = Math.max(0, auftragNetto - abgerechnet);
      const restBudgetStd = offenNetto / satz;
      const seitUmstellungStd = appMin / 60;
      const offeneTickets = arbeitsTickets.filter((t) => t.status !== 'erledigt');
      const offeneSollStd = offeneTickets.reduce((s, t) => s + (Number(t.target_hours) || 0), 0);
      const offeneMitSoll = offeneTickets.filter((t) => Number(t.target_hours) > 0).length;
      const verbleibend = restBudgetStd - seitUmstellungStd;
      let restAmpel = 'gruen';
      let restSatz = `Für den Rest stehen ${r1(restBudgetStd)} Std. zur Verfügung, davon seit der Umstellung ${r1(seitUmstellungStd)} Std. verbraucht.`;
      if (!offeneTickets.length) {
        restSatz = offenNetto > 0 ? 'Keine offenen Aufgaben mehr — der Rest kann abgerechnet werden.' : 'Keine offenen Aufgaben, alles abgerechnet.';
      } else if (offenNetto <= 0) {
        restAmpel = 'gelb';
        restSatz = `Der Auftrag ist vollständig abgerechnet, es sind aber noch ${offeneTickets.length} Aufgaben offen. Jede weitere Stunde ist nicht mehr gedeckt — knapp fertigstellen oder Mehraufwand kennzeichnen.`;
      } else if (verbleibend < 0) {
        restAmpel = 'rot';
        restSatz = `Das Restbudget seit der Umstellung ist aufgebraucht (${r1(seitUmstellungStd)} von ${r1(restBudgetStd)} Std.), noch ${offeneTickets.length} Aufgaben offen.`;
      } else if (offeneSollStd > 0 && offeneSollStd > verbleibend) {
        restAmpel = 'gelb';
        restSatz = `Die offenen Aufgaben sind mit ${r1(offeneSollStd)} Std. geplant, gedeckt sind noch ${r1(verbleibend)} Std. — Umfang prüfen oder Mehraufwand klären.`;
      } else if (restBudgetStd > 0 && seitUmstellungStd > 0.7 * restBudgetStd) {
        restAmpel = 'gelb';
        restSatz = `${pct(seitUmstellungStd, restBudgetStd)} % des Restbudgets verbraucht, noch ${offeneTickets.length} Aufgaben offen.`;
      }
      ergebnis.rest = {
        stichtag: stichtag,
        offene_aufgaben: offeneTickets.length,
        offene_aufgaben_soll_stunden: offeneSollStd ? r1(offeneSollStd) : null,
        offene_aufgaben_mit_sollstunden: offeneMitSoll,
        rest_budget_stunden: r1(restBudgetStd),
        seit_umstellung_gebucht_stunden: r1(seitUmstellungStd),
        rest_verbleibend_stunden: r1(verbleibend),
        ampel: restAmpel, aussage: restSatz,
        hinweis: 'Restbudget = noch nicht abgerechneter Auftragswert ÷ Stundensatz. Gezählt werden nur Buchungen nach dem Umstellungsstichtag.',
        ...(finanz ? { auftrag_netto: Math.round(auftragNetto), abgerechnet_netto: Math.round(abgerechnet), noch_zu_bekommen_netto: Math.round(offenNetto) } : {}),
      };
    }

    return Response.json(ergebnis);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
