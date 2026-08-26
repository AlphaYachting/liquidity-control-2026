import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Handlungsorientierte Projektintelligenz: wo muss jemand etwas TUN.
// Kein Geldfokus — Feedback einfordern, Zusagen einhalten, Projekte am Leben halten.
// Schreibt nichts.
const TAG = 86400000;

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const tageSeit = (d) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / TAG) : null);

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const svc = base44.asServiceRole;
    const [liqProjekte, sprintProjekte, clients, tickets, akteEintraege] = await Promise.all([
      svc.entities.LiquidityProject.filter({ is_active_for_billing: true }, '-created_date', 2000),
      svc.entities.Project.list('-created_date', 2000),
      svc.entities.Client.list('-created_date', 1000),
      svc.entities.Ticket.list('-created_date', 5000),
      svc.entities.ProjectFileEntry.list('-entry_date', 5000),
    ]);

    // Letzte Zeitbuchung je awork-Projekt — nur laufende Projekte brauchen ein Update.
    const letzteBuchungNachAwork = {};
    for (const e of await svc.entities.AworkTimeEntry.list('-entry_date', 4000)) {
      const id = e.awork_project_id;
      if (!id || !e.entry_date) continue;
      if (!letzteBuchungNachAwork[id] || e.entry_date > letzteBuchungNachAwork[id]) {
        letzteBuchungNachAwork[id] = e.entry_date;
      }
    }

    const kundeNachClientId = {};
    for (const c of clients) kundeNachClientId[c.id] = c.name || '';

    // Sprint-Projekt auf Liquiditätsprojekt abbilden: erst über den Kunden,
    // bei mehreren Projekten desselben Kunden über die grösste Wortüberlappung im Titel.
    const woerter = (s) => (s || '').toLowerCase().split(/[^a-zäöüß0-9]+/).filter(w => w.length > 3);
    const liqNachSprintProjekt = {};
    for (const sp of sprintProjekte) {
      const kunde = norm(kundeNachClientId[sp.client_id]);
      if (!kunde) continue;
      const kandidaten = liqProjekte.filter(lp => {
        const lpKunde = norm(lp.customer);
        return lpKunde && (lpKunde.includes(kunde) || kunde.includes(lpKunde));
      });
      if (!kandidaten.length) continue;
      let treffer = kandidaten[0];
      if (kandidaten.length > 1) {
        const spWorte = woerter(sp.title);
        let best = -1;
        for (const k of kandidaten) {
          const kWorte = woerter(k.project_name);
          const score = spWorte.filter(w => kWorte.includes(w)).length;
          if (score > best) { best = score; treffer = k; }
        }
      }
      liqNachSprintProjekt[sp.id] = treffer.id;
    }

    // Aufgaben, die auf jemand anderen warten
    const wartendNachProjekt = {};
    for (const t of tickets) {
      if (t.status === 'erledigt') continue;
      const wartetAufKunde = t.milestone_state === 'kundenfeedback';
      const wartetIntern = t.status === 'wartet' || t.milestone_state === 'pruefung';
      if (!wartetAufKunde && !wartetIntern) continue;
      const pid = liqNachSprintProjekt[t.project_id];
      if (!pid) continue;
      const liste = (wartendNachProjekt[pid] = wartendNachProjekt[pid] || []);
      liste.push({
        title: t.title,
        auf_kunde: wartetAufKunde,
        assignee: t.assignee_email || null,
        tage: tageSeit(t.last_status_change) ?? null,
      });
    }

    // Zusagen und letzter Projektstand aus dem Kundenakt
    const zusagenNachProjekt = {};
    const letzterAktNachProjekt = {};
    for (const e of akteEintraege) {
      const pid = e.project_id;
      if (!pid) continue;
      const datum = e.entry_date || e.created_date;
      if (datum && (!letzterAktNachProjekt[pid] || datum > letzterAktNachProjekt[pid])) {
        letzterAktNachProjekt[pid] = datum;
      }
      if (e.follow_up_text && !e.follow_up_done) {
        (zusagenNachProjekt[pid] = zusagenNachProjekt[pid] || []).push({
          text: e.follow_up_text,
          faellig_am: e.follow_up_date || null,
          tage_ueberfaellig: e.follow_up_date ? tageSeit(e.follow_up_date) : null,
          erfasst_von: e.recorded_by || null,
        });
      }
    }

    const feedback = [];
    const zusagen = [];
    const ohneUpdate = [];

    for (const p of liqProjekte) {
      const basis = {
        project_id: p.id,
        customer: p.customer || '',
        project_name: p.project_name || '',
        project_manager: p.project_manager || '',
      };

      const wartend = (wartendNachProjekt[p.id] || []).sort((a, b) => (b.tage || 0) - (a.tage || 0));
      if (wartend.length) {
        const aufKunde = wartend.filter(w => w.auf_kunde);
        feedback.push({
          ...basis,
          anzahl: wartend.length,
          anzahl_kunde: aufKunde.length,
          laengste_tage: wartend[0].tage,
          aufgaben: wartend.slice(0, 4),
          schweregrad: (wartend[0].tage || 0) >= 14 ? 'kritisch' : (wartend[0].tage || 0) >= 7 ? 'warnung' : 'hinweis',
        });
      }

      const offeneZusagen = (zusagenNachProjekt[p.id] || [])
        .sort((a, b) => (b.tage_ueberfaellig ?? -999) - (a.tage_ueberfaellig ?? -999));
      if (offeneZusagen.length) {
        const top = offeneZusagen[0];
        zusagen.push({
          ...basis,
          anzahl: offeneZusagen.length,
          naechste_zusage: top.text,
          faellig_am: top.faellig_am,
          tage_ueberfaellig: top.tage_ueberfaellig,
          zusagen: offeneZusagen.slice(0, 4),
          schweregrad: (top.tage_ueberfaellig ?? -999) > 0 ? 'kritisch' : 'hinweis',
        });
      }

      // Nur Projekte, an denen aktuell gearbeitet wird, aber niemand den Stand festhält.
      const letzteBuchung = p.awork_project_id ? (letzteBuchungNachAwork[p.awork_project_id] || null) : null;
      const tageOhneBuchung = tageSeit(letzteBuchung);
      const laeuft = tageOhneBuchung !== null && tageOhneBuchung <= 30;
      const letzterAkt = letzterAktNachProjekt[p.id] || null;
      const tageOhneAkt = tageSeit(letzterAkt);
      if (laeuft && (tageOhneAkt === null || tageOhneAkt >= 21)) {
        ohneUpdate.push({
          ...basis,
          letzter_eintrag: letzterAkt,
          tage_ohne_eintrag: tageOhneAkt,
          letzte_buchung: letzteBuchung,
          tage_seit_buchung: tageOhneBuchung,
          schweregrad: tageOhneAkt === null ? 'warnung' : tageOhneAkt >= 45 ? 'kritisch' : 'hinweis',
        });
      }
    }

    feedback.sort((a, b) => (b.laengste_tage || 0) - (a.laengste_tage || 0));
    zusagen.sort((a, b) => (b.tage_ueberfaellig ?? -999) - (a.tage_ueberfaellig ?? -999));
    ohneUpdate.sort((a, b) => (b.tage_ohne_eintrag ?? 9999) - (a.tage_ohne_eintrag ?? 9999));

    return Response.json({
      geprueft: liqProjekte.length,
      zuordnung_sprintprojekte: Object.keys(liqNachSprintProjekt).length,
      feedback,
      zusagen,
      ohneUpdate,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}