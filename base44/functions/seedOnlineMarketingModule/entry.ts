import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Einmalige, wiederholbare Befüllung der Online-Marketing-Module (nichts wird überschrieben).
// Eintrag: [Titel, Rolle?, optional?] für einmalig; [Titel, Rhythmus, Fenster, Rolle?] für Routinen.
const MODULE = [
  { name: 'Organisation', vor: true, rolle: 'Beratung', einmalig: [],
    routinen: [['Rechnungsexport', 'monatlich', 3], ['Lead Export', 'monatlich', 3]] },
  { name: 'Projektmanagement & Meetings', vor: true, rolle: 'Beratung',
    einmalig: [['Kickoff-Meeting'], ['Briefing & KPI-Set dokumentieren'], ['Roadmap & Meilensteinplan erstellen'], ['Jour-fixe-Rhythmus fixieren']],
    routinen: [['Kundenmeeting', 'manuell', 0]] },
  { name: 'SEA (Google Ads / Bing Ads)', rolle: 'Media',
    einmalig: [['Zugriffe einholen / Konto anlegen'], ['Konto-Audit Bestandskonto', null, true], ['Keyword- & Wettbewerbsrecherche inkl. Negativlisten'],
      ['Kontostruktur & Kampagnen-Setup (Kampagnen, Anzeigengruppen, Gebotsstrategie, Budgets)'], ['Anzeigentexte & Assets erstellen (RSA, Sitelinks, Erweiterungen)'],
      ['Conversion-Tracking & Conversion-Werte einrichten mittels GTM', 'Web'], ['Kampagnen-Launch & Freigabe']],
    routinen: [['Kampagnenkontrolle & Optimierungen', 'woechentlich', 3]] },
  { name: 'SEO/GEO', rolle: 'Web',
    einmalig: [['Zugriff Search Console & Bing Webmaster Tools einholen'], ['Technisches SEO-Audit (Crawling, Indexierung, Core Web Vitals/INP, Statuscodes)'],
      ['Keyword- & Themenrecherche inkl. Keyword-Mapping', 'Konzept'], ['OnPage-Basisoptimierung'], ['Strukturierte Daten (JSON-LD) implementieren'],
      ['GEO-Basis aufsetzen'], ['SEO-Maßnahmenplan & Priorisierung', 'Konzept'], ['GBP-Grundeinrichtung'], ['NAP-Konsistenz & Branchenverzeichnisse prüfen']],
    routinen: [['Google My Business laufend', 'monatlich', 5]] },
  { name: 'Social Ads', rolle: 'Media',
    einmalig: [['Zugriff Meta Business Manager einholen'], ['Zugriff TikTok Business Center einholen', null, true], ['Werbekonto, Zahlungsdaten & Rollen prüfen bzw. einrichten'],
      ['Pixel & Conversions API einrichten', 'Web'], ['Zielgruppenanalyse'], ['Zielgruppen aufsetzen'], ['Kampagnen- & Funnelstruktur definieren'],
      ['Werbemittel-Erstset produzieren', 'Grafik'], ['Kampagnen-Launch & Freigabe']],
    routinen: [['Kampagnenkontrolle & Optimierungen', 'woechentlich', 3]] },
  { name: 'Social Media', rolle: 'Media',
    einmalig: [['Zugriff auf Seiten & Profile einholen bzw. Profile anlegen'], ['Profiloptimierung'], ['Kanal- & Contentstrategie festlegen', 'Konzept'],
      ['Content-Säulen definieren & Redaktionsplan-Vorlage anlegen', 'Konzept'], ['Design-Templates für Feed, Story & Reel erstellen', 'Grafik'],
      ['Planungstool einrichten'], ['Community-Management-Leitfaden', 'Text']],
    routinen: [['Content Planung & Ausspielung', 'monatlich', 5]] },
  { name: 'Newsletter', rolle: 'Text',
    einmalig: [['Newsletter-Tool auswählen & Account/Zugriff einrichten', 'Web'], ['Domain-Authentifizierung einrichten', 'Web'],
      ['Empfängerlisten importieren & segmentieren', 'Web'], ['Anmeldeformular & Double-Opt-in-Strecke aufsetzen', 'Web'],
      ['Newsletter-Template im CI erstellen & Client-Tests', 'Grafik'], ['Testversand & Freigabe']],
    routinen: [['Newsletter Planung & Aussendung', 'monatlich', 5]] },
  { name: 'Datenanalyse & Recherche', rolle: 'Web',
    einmalig: [['Zugriff GA4 & GTM einholen (adwords@rittler.co & google@rittler.co)'], ['Messkonzept erstellen', 'Konzept'], ['GA4- & GTM-Setup bzw. Bereinigung'],
      ['Consent-Management einrichten & prüfen'], ['Server-Side Tagging aufsetzen', null, true], ['Ausgangsanalyse Markt & Wettbewerb inkl. Benchmarks', 'Konzept']],
    routinen: [] },
  { name: 'Design, Video & Grafik', rolle: 'Grafik',
    einmalig: [['CI, Styleguide & Markenassets einholen'], ['Asset-Bibliothek & Ablagestruktur aufsetzen'], ['Bild- und Videomaterial sichten, Bedarf & Quellen klären (Shooting/Stock)'],
      ['Design-Templates & Vorlagen erstellen'], ['Erstproduktion Basis-Werbemittel in allen Formaten'], ['Nachbereitungs-Workflow definieren']],
    routinen: [] },
  { name: 'Berichtwesen', rolle: 'Beratung',
    einmalig: [['Reporting-Anforderungen definieren'], ['Datenquellen anbinden', 'Web'], ['Dashboard/Reporting-Template erstellen', 'Web'],
      ['Baseline-Werte vor Start dokumentieren'], ['Testbericht erstellen & Freigabe einholen']],
    routinen: [['Berichterstellung & Aussendung', 'monatlich', 5]] },
  { name: 'Content', rolle: 'Text', einmalig: [], routinen: [['Content planen & erstellen', 'monatlich', 5]] },
];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') return Response.json({ error: 'Nur für Admins' }, { status: 403 });
  const db = base44.asServiceRole.entities;

  const vorhandene = await db.ModuleTemplate.list('-created_date', 500);
  let module = 0, vorlagen = 0;

  for (const m of MODULE) {
    let mod = vorhandene.find((x) => (x.name || '').trim() === m.name);
    if (!mod) {
      mod = await db.ModuleTemplate.create({
        name: m.name, default_arbeitsmodell: 'container', active: true,
        target_hours: 0, standard_price: 0, vorausgewaehlt: !!m.vor,
      });
      module++;
    }
    const alt = await db.TicketTemplate.filter({ module_template_id: mod.id }, 'order', 500);
    const titel = new Set(alt.map((t) => (t.title || '').trim()));
    const liste = [
      ...m.einmalig.map(([title, rolle, optional]) => ({ title, role: rolle || m.rolle, art: 'einmalig', optional: !!optional })),
      ...m.routinen.map(([title, rhythmus, fenster, rolle]) => ({ title, role: rolle || m.rolle, art: 'routine', rhythmus, fenster_tage: fenster, optional: false })),
    ];
    const neu = [];
    liste.forEach((v, i) => {
      if (titel.has(v.title)) return;
      neu.push({ ...v, module_template_id: mod.id, order: i + 1, target_hours: 0, milestone_state: 'produktion', blocks_others: false });
    });
    if (neu.length) { await db.TicketTemplate.bulkCreate(neu); vorlagen += neu.length; }
  }

  return Response.json({ module, vorlagen });
});