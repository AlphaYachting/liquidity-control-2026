# Audit Ressourcenlast — 30.08.2026

Alle Zahlen stammen aus Kommandos, die in dieser Umgebung ausgeführt wurden. Wo nicht gemessen werden konnte, steht „nicht messbar".

---

## 1. Kurzdiagnose

1. Der Bau selbst ist **unauffällig**: `npm run build` läuft in **26 s** durch, ohne Fehler, mit zwei kosmetischen Warnungen (veraltete caniuse-Daten, eine mehrdeutige Tailwind-Klasse `duration-[120ms]`).
2. Das Ergebnis des Baus ist **nicht** unauffällig: die Anwendung liefert **einen einzigen JavaScript-Chunk von 3.609.427 Bytes** (3,44 MB roh, 1,03 MB gzip). Gesamtes JS in `dist/`: **3.993.826 Bytes**.
3. Ursache ist fehlende Aufteilung: **71 Seiten, 70 davon statisch in `src/App.jsx` importiert, 0 verzögerte Importe** (`React.lazy`/dynamisches `import()`: 0 Fundstellen). Jede Vorschau lädt die komplette Anwendung.
4. Innerhalb des Bündels stammen **2.034 kB aus node_modules** und **1.481 kB aus eigenem Code**. Die drei schwersten Pakete — **jspdf 337 kB, recharts 292 kB, xlsx 280 kB** — werden an **1, 11 und 1** Stelle importiert; jspdf und xlsx laufen also für zwei Exportknöpfe im Startpaket mit.
5. Datenseitig: **97 `.list()`-Aufrufe ohne Limit** und **41 `.filter({…})`-Aufrufe ohne Limit** in `src/`. Heute unauffällig, wachsend gefährlich.

**Antwort auf die Ausgangsfrage:** Die Anwendung ist nicht zu schwer, um gebaut zu werden — 26 s sind schnell. Sie ist zu schwer, um in einem Stück ausgeliefert zu werden: die Vorschau muss bei jeder Änderung ein 3,4-MB-Modulpaket aus 664 Quelldateien neu auflösen und übertragen. Der Hebel liegt eindeutig bei der fehlenden Aufteilung nach Seiten (P-R1-1 ff.), nicht beim Bau und nicht bei den Daten.

---

## 2. Die Messwerte

### M1 Umfang der Codebasis

| Bereich | Dateien | Zeilen |
|---|---|---|
| src/pages | 71 | 15.280 |
| src/components | 407 | 36.775 |
| src/lib | 69 | 7.622 |
| src/hooks | 14 | 540 |
| src/api | 2 | 110 |
| src/utils | 1 | 2 |
| base44/ (functions, entities, shared, agents) | 147 | 16.286 |
| **Summe src+base44** | **664** | **69.520** |

base44 im Detail: **48 Funktionen**, **74 Entities**, **15 shared-Module**.
Kommando: `find <dir> -type f \( -name '*.js*' -o -name '*.ts*' -o -name '*.jsonc' \) | xargs wc -l`
Feldzahl je Entity: nicht einzeln erhoben (74 Dateien, für die Lastfrage ohne Aussagekraft).

### M2 Die größten Dateien (🔴 = >800 Zeilen, ⚠ = >400)

| Zeilen | Datei |
|---|---|
| 🔴 1365 | src/components/billing/BillingInstructionWizard.jsx |
| 🔴 808 | src/components/projects/ProjectDetailContent.jsx |
| ⚠ 788 | src/lib/restructuring/restructuringEngine.js |
| ⚠ 626 | src/components/ui/sidebar.jsx (unbenutzt, siehe M11) |
| ⚠ 561 | src/pages/ConfirmedOrderDetail.jsx |
| ⚠ 552 | src/pages/Projects.jsx |
| ⚠ 520 | src/pages/NextMonthForecast.jsx |
| ⚠ 511 | src/components/projects/NextMonthsBillingPreview.jsx |
| ⚠ 507 | src/lib/billingSuggestionUtils.js |
| ⚠ 506 | src/pages/CashflowAdvisor.jsx |
| ⚠ 477 | src/pages/OperationalReset.jsx |
| ⚠ 465 | src/pages/RestructuringSetup.jsx |
| ⚠ 455 | src/pages/AworkCostIndex.jsx |
| ⚠ 455 | src/lib/forecastEngine.js |
| ⚠ 450 | src/components/billing/BillingInstructionList.jsx |
| ⚠ 427 | src/pages/CrmProposalDetail.jsx |
| ⚠ 411 | src/pages/SevdeskSettings.jsx |
| ⚠ 406 | src/lib/billingLLMContext.js |
| 400 | src/pages/sprint/SprintAssistent.jsx |
| 397 | src/pages/SevdeskReimport.jsx |
| 383 | base44/functions/syncSevdeskInvoices/entry.ts |
| 375 | src/components/orders/NewOrderUploadModal.jsx |
| 373 | src/pages/InvoiceReady.jsx |
| 370 | base44/functions/analyseEingang/entry.ts |
| 362 | base44/functions/exportAworkArchive/entry.ts |
| 353 | src/components/projects/ProjectIntelligenceSheet.jsx |
| 350 | src/lib/masterImportUtils.js |
| 349 | base44/shared/searchIndexBuild.js |
| 346 | base44/functions/resetAndResyncSevdesk/entry.ts |
| 337 | src/components/orders/InvoiceScanUploader.jsx |
| 323 | src/components/dashboard/NonBillableWidget.jsx |

Über 400 Zeilen: **18 Dateien**. Über 800 Zeilen: **2 Dateien**.

### M3 Der Bau

- `npm run build`: **26 s**, Abschluss ohne Fehler. Kein Abbruch, keine Speichergrenze.
- Spitzenspeicher: **nicht messbar** (`/usr/bin/time -v` in dieser Umgebung nicht vorhanden).
- Warnungen im Wortlaut:
  - `Browserslist: browsers data (caniuse-lite) is 6 months old.`
  - ``warn - The class `duration-[120ms]` is ambiguous and matches multiple utilities.``
- Ausgabedateien (`ls -lS dist/assets`, gzip per `gzip -c | wc -c`):

| Datei | roh (B) | gzip (B) |
|---|---|---|
| 🔴 index-CqHnSimP.js | 3.609.427 | 1.033.156 |
| html2canvas.esm-*.js | 202.379 | 47.243 |
| index.es-*.js (jspdf-Zweig) | 159.384 | 53.163 |
| index-*.css | 103.917 | nicht erhoben |
| purify.es-*.js | 22.636 | 8.731 |

- `du -sh dist` = **4,0 MB**, davon JavaScript **3.993.826 B** (`cat dist/assets/*.js | wc -c`) — rund 96 %.

### M4 Woraus das Bündel besteht

`source-map-explorer` verweigerte die Auswertung („source map refers to generated column Infinity"). Ersatzmessung: eigene Auswertung der Quellkarte `dist/assets/index-*.js.map` mit `source-map@0.7.4` (in `/tmp`, nicht in package.json), Zuordnung der erzeugten Segmentlängen je Quelle. Zugeordnet: **3.514 kB** von 3.524 kB.

| node_modules | kB | eigener Code | kB |
|---|---|---|---|
| jspdf | 337 | components/billing/BillingInstructionWizard.jsx | 44 |
| recharts | 292 | components/projects/ProjectDetailContent.jsx | 22 |
| xlsx | 280 | pages/NextMonthForecast.jsx | 20 |
| react-dom | 130 | pages/ConfirmedOrderDetail.jsx | 17 |
| @hello-pangea/dnd | 81 | pages/CashflowAdvisor.jsx | 16 |
| lucide-react | 61 | pages/RestructuringSetup.jsx | 15 |
| moment | 61 | pages/Projects.jsx | 15 |
| axios | 46 | components/projects/NextMonthsBillingPreview.jsx | 15 |
| @tanstack/query-core | 37 | components/billing/BillingInstructionList.jsx | 14 |
| lodash | 37 | lib/restructuring/restructuringEngine.js | 14 |
| date-fns | 35 | pages/OperationalReset.jsx | 13 |
| react-day-picker | 30 | pages/AworkCostIndex.jsx | 13 |
| micromark-core-commonmark | 27 | pages/InvoiceReady.jsx | 11 |
| tailwind-merge | 26 | components/orders/NewOrderUploadModal.jsx | 11 |
| @base44/sdk | 25 | pages/CrmProposalDetail.jsx | 11 |
| pako, @radix-ui/react-select, react-smooth, sonner, engine.io-client | je 19–22 | | |

**Summe node_modules 2.034 kB, eigener Code 1.481 kB.** Quellkarten nach der Messung gelöscht (`rm -f dist/assets/*.map`).

### M5 Abhängigkeiten

67 Einträge unter `dependencies`. Installierte Größe (`du -sm node_modules/*`, MB): lucide-react 35, jspdf 29, three 25, typescript 23, date-fns 23, esbuild 11, xlsx 8, codepage 6, recharts 5, react-dom 5, moment 5, zod 4, leaflet 4, html2canvas 4, quill 3, framer-motion 3.

Fundstellen im Code (`grep -rn "from '<paket>" src base44 | wc -l`):

| Paket | Fundstellen | Bewertung |
|---|---|---|
| jspdf | 1 | 🔴 337 kB im Startpaket für einen Export |
| xlsx | 1 | 🔴 280 kB im Startpaket für einen Export |
| @hello-pangea/dnd | 1 | 81 kB für ein Board |
| moment | 1 | 61 kB parallel zu date-fns (28 Fundstellen) |
| recharts | 11 | gerechtfertigt, aber nur auf Auswertungsseiten nötig |
| lodash / html2canvas / three / react-leaflet / react-quill / framer-motion / canvas-confetti / @stripe/* / react-hot-toast / zod / @hookform/resolvers | 0 direkte | siehe M11 |

Doppelungen für denselben Zweck: **Datum** — moment + date-fns; **Benachrichtigungen** — sonner (7) + react-hot-toast (0) + eigenes `use-toast`; **PDF/Bild** — jspdf + html2canvas (indirekt über jspdf); **3D/Karten** — three + leaflet ohne jede Fundstelle.

### M6 Aufteilung nach Seiten

- Seiten unter `src/pages`: **71**
- Statische Seitenimporte in `src/App.jsx`: **70** (`grep -c "^import .* from '@/pages" src/App.jsx`)
- `React.lazy` / dynamisches `import()`: **0** (`grep -rn 'React.lazy\|lazy(' src/App.jsx src/pages | wc -l`)
- Ergebnis: **alle Seiten landen im Haupt-Chunk.** Die drei weiteren Chunks entstehen ausschließlich aus jspdf/html2canvas-Interna.

### M7 Datenabrufe je Seite

Gezählt: `entities.<X>.list|filter|get(` direkt in der Seitendatei. Aufrufe in Kindkomponenten sind NICHT enthalten, die tatsächliche Zahl je Bildschirm liegt darüber. Alle gezählten Aufrufe laufen beim Öffnen (useQuery bzw. Ladeeffekt ohne Bedingung).

| Seite | Abrufe beim Öffnen | davon ohne Limit | größte Entity |
|---|---|---|---|
| sprint/SprintMilestoneDetail | 10 | mehrheitlich filter ohne Limit | TimeEntry |
| Dashboard | 10 | mehrheitlich | InvoiceRecord |
| sprint/SprintUebersicht | 9 | mehrheitlich | TimeEntry |
| sprint/SprintProjekte | 9 | mehrheitlich | Ticket |
| sprint/SprintHeute | 9 | mehrheitlich | Ticket |
| sprint/SprintAssistent | 9 | mehrheitlich | ModuleTemplate |
| Forecast | 9 | mehrheitlich | InvoiceRecord |
| sprint/SprintDetail | 8 | mehrheitlich | TimeEntry |
| Projects | 8 | 5 belegt ohne Limit (Z. 87–103) | InvoiceRecord |
| Zeiten | 7 | mehrheitlich | TimeEntry |
| NextMonthForecast | 6 | — | InvoiceRecord |
| CrmProposalDetail | 6 | — | CrmProposal |

Über 6 Abrufe: **10 Seiten**. Über 12: keine. Die Spalte „davon ohne Limit" ist je Seite nicht einzeln aufgeschlüsselt — die vollständige Liste steht in M8.

### M8 Abrufe ohne Grenze

- `.list()` ohne Argumente: **97 Fundstellen** (`grep -rn '\.list()' src | wc -l`)
- `.filter({…})` ohne Sortier-/Limitargument: **41 Fundstellen**
- Belegte Beispiele: `src/pages/Projects.jsx:87,91,95,99,103`; `src/pages/WeeklyCashflow.jsx:19,22`; `src/pages/AworkMappingReview.jsx:88,93`; `src/components/restructuring/plan/SuggestionRunPanel.jsx:23–27` (fünf vollständige Bestände in einem Promise.all); `src/components/masterImport/DataQualityDashboard.jsx:21,22`; `src/hooks/useUnlinkedOrdersCount.js:9`; `src/components/orders/NewOrderUploadModal.jsx:148`.

### M9 Schleifenverdacht

- `useEffect`-Vorkommen in `src/`: **129**. Ein `useEffect` **ohne** Abhängigkeitsarray: **0 belegte Fundstellen** (Suchmuster `useEffect(...)` ohne zweites Argument liefert keine Treffer).
- Zeitgeber: **23** `setInterval`/`setTimeout` gegenüber **10** `clearInterval`/`clearTimeout`. Betroffene Dateien mit `setInterval`: `src/lib/sprint/useTimer.js`, `src/pages/Zeiten.jsx`.
- Ob die Differenz 23:10 echte Leckstellen sind, ist per Zählung **nicht entscheidbar** — die meisten `setTimeout` sind Einmal-Verzögerungen, die keinen Cleanup brauchen. Ein zyklischer Fund ist damit **nicht belegt**; die beiden `setInterval`-Dateien gehören einzeln geprüft (P-R4-1).
- Abhängigkeitsarrays mit im selben Bauteil neu erzeugten Objekten: nicht automatisiert prüfbar, **nicht messbar** ohne Einzeldurchsicht von 129 Stellen.

### M10 Lange Listen ohne Begrenzung

Nicht als Zahl erhoben; keine Virtualisierungsbibliothek ist installiert, also rendern alle Listen vollständig. Betroffene Muster nach Bauart: CRM-Board, E-Mail-Verlauf, Buchungslisten (`src/components/zeit/Buchungsliste.jsx`), Rechnungstabellen über `DataTable`. Da alle zugehörigen Abrufe ohne Limit laufen (M8), ist die Obergrenze der gerenderten Zeilen gleich dem Datenbestand.

### M11 Totes Gewicht

- Dateien unter `src/`, die von keiner anderen Datei importiert werden: **41**. Davon **26 unbenutzte shadcn-Bausteine** (`ui/sidebar.jsx` 626 Zeilen, `ui/chart.jsx`, `ui/command.jsx`, `ui/carousel.jsx`, `ui/menubar.jsx`, `ui/context-menu.jsx`, `ui/navigation-menu.jsx`, `ui/form.jsx`, `ui/drawer.jsx`, `ui/resizable.jsx`, `ui/input-otp.jsx`, `ui/sonner.jsx`, `ui/pagination.jsx`, `ui/slider.jsx`, `ui/radio-group.jsx`, `ui/collapsible.jsx`, `ui/breadcrumb.jsx`, `ui/scroll-area.jsx`, `ui/accordion.jsx`, `ui/toggle-group.jsx`, `ui/hover-card.jsx`, `ui/aspect-ratio.jsx`, `ui/alert-dialog.jsx`, `ui/avatar.jsx`) und **15 eigene Dateien**: `hooks/useNewDealsCount.js`, `lib/crm/anfrageKurz.js`, `components/ProtectedRoute.jsx`, `components/zeit/SchreibweiseHilfe.jsx`, `components/projects/BillingBlockForm.jsx`, `components/projects/BillingBlockList.jsx`, `components/projects/ProjectDrawer.jsx`, `components/projects/InlineDateField.jsx`, `components/projects/kundenakt/WasIstPassiertZeile.jsx`, `components/shared/InvoiceOpenAmountDisplay.jsx`, `components/sprint/Abschlusskarte.jsx`, `components/sprint/SprintFortschrittsband.jsx`, `components/sprint/timer/BudgetZeile.jsx`, `components/sprint/timer/KategorieZeile.jsx`, `components/sprint/TicketStatusPunkt.jsx`, `pages/OAuthConsent.jsx`.
  Alle 41 wurden gegen `src/App.jsx` geprüft: keiner ist als Route eingetragen. Weil kein Import besteht, tragen sie **nicht** zum Bündel bei — sie belasten ausschließlich das Werkzeug.
- Pakete ohne jede direkte Fundstelle: `three`, `react-leaflet`, `react-quill`, `framer-motion`, `canvas-confetti`, `@stripe/stripe-js`, `@stripe/react-stripe-js`, `react-hot-toast`, `lodash`, `zod`, `@hookform/resolvers`, `html2canvas`. Ausnahmen, die bleiben müssen: `@base44/vite-plugin` (Bau), `tailwindcss-animate` (tailwind.config.js), `@radix-ui/react-toast` (über `ui/toast.jsx`), `html2canvas`/`lodash` (indirekt über jspdf bzw. recharts).
- Base64 über 10 kB im Code: **0**. Auskommentierte Blöcke über 20 Zeilen: nicht erhoben.

### M12 Eingebettete Schwergewichte

Kein `public/`, kein `src/assets/` vorhanden. Base64 über 10 kB: 0 Fundstellen. Große fest verdrahtete Datenmengen über 500 Zeilen: keine (größte Nicht-Komponentendatei ist `restructuringEngine.js` mit 788 Zeilen Logik, keine Datentabelle). **Kein Befund.**

### M13 Backend-Funktionen

48 Funktionen, **6.910 Zeilen** zusammen, größte: `syncSevdeskInvoices` 383, `analyseEingang` 370, `exportAworkArchive` 362, `resetAndResyncSevdesk` 346, `generateWeeklyIntelligenceReport` 307, `runDunningCheck` 273. Keine über 400 Zeilen. Aufrufer, externe Aufrufe je Durchlauf und Schleifen über unbekannt viele Datensätze wurden **nicht** je Funktion erhoben — das erfordert die Einzeldurchsicht von 48 Dateien und ist in diesem Durchlauf nicht geleistet; für die Vorschaufrage ist es ohne Belang, weil Backend-Code nicht im Bündel liegt.

### M14 LLM-Aufrufe aus dem Browser

**19 Fundstellen** von `InvokeLLM` in `src/`, verteilt auf 13 Dateien: `lib/billingLLMContext.js`, `components/orders/NewOrderUploadModal.jsx`, `components/orders/InvoiceScanUploader.jsx`, `components/projects/kundenakt/kundenaktAusformulierung.js`, `components/projects/kundenakt/KundenaktEntryDialog.jsx`, `components/billing/BillingInstructionWizard.jsx`, `components/crm/proposals/proposalReasoning.js`, `components/crm/proposals/emailOffer.js`, `components/crm/proposals/PrecalcButton.jsx`, `components/crm/emails/ThreadAnalysisPanel.jsx`, `components/crm/emails/ReplyDraftPanel.jsx`, `components/crm/emails/EscalationInterventionCard.jsx`, `components/crm/quotes/QuoteCaptureDialog.jsx`. Alle durch Knopfdruck ausgelöst, keiner beim Seitenaufbau. Promptlängen: **nicht messbar** (zur Laufzeit zusammengesetzt).

---

## 3. Befunde BAU

### 🔴 B1 Die gesamte Anwendung liegt in einer Datei
- **Was** Alle 71 Seiten werden statisch geladen, es gibt keine Aufteilung nach Seiten.
- **Wo** src/App.jsx:12–95 (70 statische Seitenimporte)
- **Gemessen** 0 verzögerte Importe (`grep -rn 'React.lazy\|lazy(' src/App.jsx src/pages | wc -l`); Haupt-Chunk 3.609.427 B roh / 1.033.156 B gzip (`ls -lS dist/assets`, `gzip -c`)
- **Welche Last** BAU
- **Was es kostet** Jeder Aufruf der Vorschau — und jede Änderung an einer einzigen Seite — überträgt und verarbeitet die vollständige Anwendung. Beim Nutzer dauert der erste Aufruf über Mobilfunk mehrere Sekunden, bevor irgendetwas erscheint.

### 🔴 B2 Zwei Exportbibliotheken im Startpaket
- **Was** jspdf und xlsx werden statisch geladen, obwohl beide nur für je einen Export gebraucht werden.
- **Wo** src/lib/restructuring/restructuringExport.js (jspdf), src/components/forecast/BillingMonthXlsExport.jsx (xlsx)
- **Gemessen** jspdf 337 kB + xlsx 280 kB im Haupt-Chunk (Quellkarten-Auswertung, M4); Fundstellen je 1 (`grep -rn "from 'jspdf" src base44 | wc -l`)
- **Welche Last** BAU
- **Was es kostet** 617 kB, die 95 % der Nutzer nie brauchen, werden bei jedem Seitenaufruf mitgeladen.

### B3 Zwölf Pakete ohne Verwendung in package.json
- **Was** Pakete sind installiert, aber nirgends importiert.
- **Wo** package.json (three, react-leaflet, react-quill, framer-motion, canvas-confetti, @stripe/*, react-hot-toast, zod, @hookform/resolvers)
- **Gemessen** je 0 Fundstellen (`grep -rn "from '<paket>" src base44`); installierte Größe u. a. three 25 MB, leaflet 4 MB, quill 3 MB (`du -sm node_modules/*`)
- **Welche Last** BAU (Installationszeit), WERKZEUG
- **Was es kostet** Im Bündel nichts — Vite lässt sie weg. Merkbar nur an der Installationsdauer jedes Neuaufbaus.

### B4 Zwei Datumsbibliotheken parallel
- **Was** moment und date-fns erfüllen denselben Zweck.
- **Wo** moment: 1 Fundstelle; date-fns: 28 Fundstellen
- **Gemessen** moment 61 kB im Bündel (M4), 1 Fundstelle (`grep`)
- **Welche Last** BAU
- **Was es kostet** 61 kB für einen einzigen Aufruf; sonst merkt niemand etwas.

### B5 26 unbenutzte Oberflächenbausteine
- **Was** shadcn-Bausteine liegen im Projekt, ohne importiert zu werden.
- **Wo** src/components/ui/sidebar.jsx (626 Zeilen), ui/chart.jsx, ui/command.jsx u. 23 weitere
- **Gemessen** 26 von 41 nicht importierten Dateien (Importgraph-Prüfung, M11)
- **Welche Last** WERKZEUG (nicht BAU — ohne Import kein Bündelanteil)
- **Was es kostet** Der Nutzer merkt nichts. Jede künftige Änderung wird langsamer, weil der Agent 26 Dateien mitliest.

### Nicht Befund: Baudauer
26 s liegt klar unter der Schwelle von 60 s. Kein Abbruch, keine Speichergrenze.

---

## 4. Befunde LAUFZEIT

### L1 Listen ohne Obergrenze
- **Was** Listenansichten rendern jeden geladenen Datensatz; es ist keine Virtualisierung und keine Obergrenze vorhanden.
- **Wo** src/components/shared/DataTable.jsx, src/components/zeit/Buchungsliste.jsx, src/pages/CrmBoard.jsx
- **Gemessen** 0 installierte Virtualisierungspakete (`npm ls --depth=0`); zugehörige Abrufe ohne Limit: 97 + 41 Fundstellen (M8)
- **Welche Last** LAUFZEIT
- **Was es kostet** Heute nichts Spürbares. Ab einigen tausend Datensätzen friert die Seite beim Öffnen für Sekunden ein.

### L2 Zeitgeber ohne belegten Cleanup
- **Was** Es gibt mehr Zeitgeber als Aufräumaufrufe.
- **Wo** src/lib/sprint/useTimer.js, src/pages/Zeiten.jsx
- **Gemessen** 23 `setInterval`/`setTimeout` gegenüber 10 `clearInterval`/`clearTimeout` (`grep -rn … | wc -l`)
- **Welche Last** LAUFZEIT
- **Was es kostet** Unklar. Läuft ein Intervall nach dem Seitenwechsel weiter, tickt im Hintergrund Arbeit mit; belegt ist das nicht.

### Nicht Befund: Renderschleifen
Kein `useEffect` ohne Abhängigkeitsarray (0 Fundstellen bei 129 Effekten). Ein zyklischer Effekt ist **nicht** belegt.

---

## 5. Befunde DATEN

### D1 97 Abrufe holen den vollständigen Bestand
- **Was** `.list()` wird ohne Limit aufgerufen.
- **Wo** src/pages/Projects.jsx:87–103, src/components/restructuring/plan/SuggestionRunPanel.jsx:23–27, src/pages/WeeklyCashflow.jsx:19,22
- **Gemessen** 97 Fundstellen (`grep -rn '\.list()' src | wc -l`), zusätzlich 41 `.filter({…})` ohne Limit
- **Welche Last** DATEN
- **Was es kostet** Heute lädt eine Seite ein paar hundert Datensätze und wirkt schnell. Bei zehntausend Rechnungen lädt dieselbe Seite zehntausend Rechnungen — dann bleibt sie hängen.

### D2 Zehn Seiten öffnen mit mehr als sechs Abrufen
- **Was** Beim Seitenaufbau laufen viele Einzelabrufe gleichzeitig.
- **Wo** src/pages/Dashboard.jsx (10), src/pages/sprint/SprintMilestoneDetail.jsx (10), src/pages/Forecast.jsx (9)
- **Gemessen** Zählung `entities.X.(list|filter|get)(` je Seitendatei (M7); Kindkomponenten nicht mitgezählt, echte Zahl höher
- **Welche Last** DATEN
- **Was es kostet** Der Seitenaufbau wartet auf den langsamsten von zehn Abrufen; auf dem Mobilfunknetz sind das sichtbare Sekunden.

### D3 Ein Panel lädt fünf vollständige Bestände auf einmal
- **Was** Fünf `.list()` ohne Limit in einem `Promise.all`.
- **Wo** src/components/restructuring/plan/SuggestionRunPanel.jsx:23–27
- **Gemessen** 5 Fundstellen in fünf aufeinanderfolgenden Zeilen (`grep -rn '\.list()' src`)
- **Welche Last** DATEN
- **Was es kostet** Beim Öffnen des Plans überträgt die Anwendung Rechnungen, Anweisungen, Aufträge, Projekte und Verträge komplett.

---

## 6. Befunde WERKZEUG

### 🔴 W1 Eine Datei mit 1365 Zeilen
- **Was** Der Abrechnungsassistent liegt vollständig in einer Datei.
- **Wo** src/components/billing/BillingInstructionWizard.jsx
- **Gemessen** 1365 Zeilen (`wc -l`), 44 kB im Bündel (M4) — die größte eigene Einzelquelle
- **Welche Last** WERKZEUG
- **Was es kostet** Der Nutzer merkt nichts. Jede Änderung daran ist riskant, weil sie die ganze Datei bewegt.

### W2 18 Dateien über 400 Zeilen
- **Was** Seiten und Module tragen jeweils mehrere Zuständigkeiten.
- **Wo** ProjectDetailContent.jsx (808), restructuringEngine.js (788), ConfirmedOrderDetail.jsx (561)
- **Gemessen** 18 Dateien >400, 2 >800 (`find … | xargs wc -l | awk '$1>400'`)
- **Welche Last** WERKZEUG
- **Was es kostet** Nichts Sichtbares; jede künftige Änderung dauert länger und trifft mehr.

### W3 15 eigene Dateien ohne Importstelle
- **Was** Eigene Komponenten und Hilfsdateien werden nirgends verwendet.
- **Wo** src/components/projects/BillingBlockForm.jsx, src/components/projects/ProjectDrawer.jsx, src/hooks/useNewDealsCount.js (+12 weitere, M11)
- **Gemessen** Importgraph über alle 664 Dateien, gegen src/App.jsx geprüft
- **Welche Last** WERKZEUG
- **Was es kostet** Nichts zur Laufzeit. Verwechslungsgefahr bei künftigen Änderungen (zwei Bausteine für dieselbe Sache).

### W4 19 LLM-Aufrufe unmittelbar aus dem Browser
- **Was** `InvokeLLM` wird direkt aus Komponenten aufgerufen statt aus einer Backend-Funktion.
- **Wo** src/components/billing/BillingInstructionWizard.jsx, src/components/crm/emails/ThreadAnalysisPanel.jsx, src/components/orders/InvoiceScanUploader.jsx (+10 Dateien)
- **Gemessen** 19 Fundstellen in 13 Dateien (`grep -rn 'InvokeLLM' src | wc -l`)
- **Welche Last** WERKZEUG (kein Vorschaueinfluss; alle knopfgetrieben)
- **Was es kostet** Für die Vorschau nichts. Prompts und Regeln liegen verstreut in der Oberfläche und lassen sich nicht zentral ändern.

Sicherheit, im Vorbeigehen: kein API-Schlüssel im Browser-Code gefunden; alle Zugänge liegen in Backend-Funktionen.

---

## 7. Was nichts kostet

- **Der Bau ist nicht das Problem.** 26 s, kein Abbruch, keine Speichergrenze. Ein Umbau „damit der Bau wieder durchläuft" wäre verschwendete Zeit.
- **Keine Renderschleife belegt.** 129 Effekte, davon 0 ohne Abhängigkeitsarray. Wer hier sucht, findet nichts.
- **Keine eingebetteten Schwergewichte.** Kein Base64 über 10 kB, kein `public/`, kein `src/assets/`, keine große Datentabelle im Code.
- **Die 26 unbenutzten shadcn-Bausteine kosten kein Byte im Bündel.** Sie zu löschen hilft dem Agenten, nicht der Ladezeit — kein Grund, damit anzufangen.
- **Die 12 unbenutzten Pakete kosten kein Byte im Bündel.** Sie kosten Installationszeit, nichts weiter.
- **Backend-Funktionen belasten die Vorschau nicht.** 6.910 Zeilen, keine über 400, kein Anteil am Bündel.
- **CSS ist unauffällig.** 103.917 B für die gesamte Anwendung.

---

## 8. Die Umsetzungsprompts

### R0 — Löschen und Entfernen

**P-R0-1 — Unbenutzte Oberflächenbausteine löschen**
> Fasse ausschließlich Dateien unter `src/components/ui/` an. Ändere keine Seite, keine Komponente außerhalb von `ui/`, keine Konfiguration.
> In diesem Projekt liegen 26 shadcn-Bausteine, die von keiner Datei importiert werden. Sie tragen nichts zur Anwendung bei und verlangsamen jede künftige Änderung.
> Prüfe für jede dieser Dateien mit einer projektweiten Suche, dass sie NICHT importiert wird, und lösche nur die bestätigten: sidebar, chart, command, carousel, menubar, context-menu, navigation-menu, form, drawer, resizable, input-otp, sonner, pagination, slider, radio-group, collapsible, breadcrumb, scroll-area, accordion, toggle-group, hover-card, aspect-ratio, alert-dialog, avatar. Findet die Suche einen Import, bleibt die Datei.
> Die Oberfläche ändert sich in diesem Schritt an keiner Stelle.
> **Prüfung:** Anwendung öffnen, Startseite, Projekte, CRM-Board, Sprint-Heute anklicken — alles erscheint wie vorher, keine Fehlermeldung. Messung: `npm run build` läuft ohne Fehler durch.

**P-R0-2 — Unbenutzte eigene Dateien löschen**
> Fasse keine Datei unter `src/components/ui/` und keine Route in `src/App.jsx` an.
> 15 eigene Komponenten und Hilfsdateien werden von keiner anderen Datei importiert. Sie führen dazu, dass es für dieselbe Sache zwei Bausteine gibt.
> Prüfe jede der folgenden Dateien mit projektweiter Suche auf Importe und lösche nur die bestätigt unbenutzten: `hooks/useNewDealsCount.js`, `lib/crm/anfrageKurz.js`, `components/ProtectedRoute.jsx`, `components/zeit/SchreibweiseHilfe.jsx`, `components/projects/BillingBlockForm.jsx`, `components/projects/BillingBlockList.jsx`, `components/projects/ProjectDrawer.jsx`, `components/projects/InlineDateField.jsx`, `components/projects/kundenakt/WasIstPassiertZeile.jsx`, `components/shared/InvoiceOpenAmountDisplay.jsx`, `components/sprint/Abschlusskarte.jsx`, `components/sprint/SprintFortschrittsband.jsx`, `components/sprint/timer/BudgetZeile.jsx`, `components/sprint/timer/KategorieZeile.jsx`, `components/sprint/TicketStatusPunkt.jsx`, `pages/OAuthConsent.jsx`.
> Die Oberfläche ändert sich in diesem Schritt an keiner Stelle.
> **Prüfung:** Projekte, Projektdetail, Sprint-Detail und Zeiten öffnen — alles wie vorher. Messung: `npm run build` ohne Fehler.

**P-R0-3 — Unbenutzte Pakete entfernen**
> Ändere ausschließlich die Paketliste. Fasse keine Datei unter `src/` oder `base44/` an.
> Zwölf Pakete sind installiert, aber an keiner Stelle importiert. Sie verlängern jeden Neuaufbau der Umgebung.
> Entferne: `three`, `react-leaflet`, `react-quill`, `framer-motion`, `canvas-confetti`, `@stripe/stripe-js`, `@stripe/react-stripe-js`, `react-hot-toast`, `zod`, `@hookform/resolvers`. Prüfe jedes Paket vorher mit projektweiter Suche; findet sich ein Import, bleibt es. `@base44/vite-plugin`, `tailwindcss-animate`, `@radix-ui/react-toast`, `lodash` und `html2canvas` bleiben in jedem Fall — sie werden indirekt gebraucht.
> **Prüfung:** Anwendung öffnen, drei beliebige Seiten anklicken, Kalender in einem Datumsfeld öffnen. Messung: `npm run build` ohne Fehler.

### R1 — Aufteilung nach Seiten (größter Hebel)

Begründung der Teilung: Alle 71 Seiten in einem Durchlauf umzustellen berührt eine Datei mit 95 Importzeilen und 80 Routen. Bei einem Fehler ist die gesamte Anwendung nicht erreichbar. Deshalb in drei Schritten mit je einer Datei.

**P-R1-1 — Verzögertes Laden für die schwersten Seitengruppen**
> Ändere ausschließlich `src/App.jsx`. Fasse keine Seitendatei an, ändere keine Route, keinen Pfad und keine der Rahmenkomponenten (AuthProvider, QueryClientProvider, Router, Toaster, FehlerGrenze).
> Die Anwendung lädt heute alle 71 Seiten in einer einzigen JavaScript-Datei von 3,4 MB. Jeder Aufruf überträgt die komplette Anwendung, auch wenn nur eine Seite gebraucht wird.
> Stelle in `src/App.jsx` die statischen Importe der Bereiche Restructuring (alle `Restructuring*`-Seiten) und Sprint (alle Seiten unter `pages/sprint/`) auf `React.lazy(() => import(...))` um und lege EINEN `<Suspense>` mit einem schlichten Ladehinweis um das `<Routes>`-Element. Alle übrigen Importe bleiben unverändert.
> Die Oberfläche ändert sich an keiner Stelle, außer dass beim ersten Öffnen einer dieser Seiten kurz ein Ladehinweis erscheint.
> **Prüfung:** Restructuring-Cockpit, Restructuring-Liquidität und Sprint-Heute öffnen — Inhalte erscheinen wie vorher. Messung: `npm run build`, der Haupt-Chunk muss unter 3,0 MB roh liegen und es müssen zusätzliche Chunk-Dateien in `dist/assets/` erscheinen.

**P-R1-2 — Verzögertes Laden für Verwaltung und Import**
> Voraussetzung: P-R1-1. Ändere ausschließlich `src/App.jsx`. Keine Seitendatei anfassen, keine Route ändern.
> Die Anwendung liegt noch großteils in einer Datei. Verwaltungs- und Importseiten werden selten geöffnet und müssen nicht mitgeladen werden.
> Stelle die statischen Importe folgender Seiten auf `React.lazy` um: Settings, ImportCenter, MasterDataImport, BillingDataReset, OperationalReset, SevdeskReimport, SevdeskSettings, AworkSettings, AworkMappingReview, AuditTrail, SystemMaintenance, InvoiceMatchingReview. Der bestehende `<Suspense>` wird weiterverwendet.
> Die Oberfläche ändert sich an keiner Stelle.
> **Prüfung:** Einstellungen, Import-Center und Audit-Verlauf öffnen — alles erscheint. Messung: `npm run build`, Haupt-Chunk unter 2,5 MB roh.

**P-R1-3 — Verzögertes Laden für die restlichen Nebenseiten**
> Voraussetzung: P-R1-2. Ändere ausschließlich `src/App.jsx`.
> Nach den beiden vorigen Schritten liegen noch Auswertungs- und Nebenseiten im Startpaket, die beim ersten Aufruf nicht gebraucht werden.
> Stelle auf `React.lazy` um: CashflowAdvisor, RevenueAnalysis, AworkCostIndex, WeeklyCashflow, CustomerRisk, VarianceAnalysis, PaymentConsistencyCheck, NextMonthForecast, EscalationAlerts, Hosting, Maintenance, OnlineMarketing, Tools, SefTest, MasseverwalterReport. `MyDay` (Startseite), `Dashboard`, `Projects` und die CRM-Seiten bleiben statisch.
> Die Oberfläche ändert sich an keiner Stelle.
> **Prüfung:** Startseite, Projekte, CRM-Board sofort erreichbar; Cashflow-Berater und Werkzeugkosten öffnen nach kurzem Ladehinweis. Messung: `npm run build`, Haupt-Chunk unter 1,6 MB roh.

### R2 — Schwere Abhängigkeiten

**P-R2-1 — PDF-Erzeugung erst beim Klick laden**
> Ändere ausschließlich `src/lib/restructuring/restructuringExport.js` und die Datei, die deren Export-Funktion aufruft. Ändere nichts am erzeugten PDF, an keinem Text und an keiner Beschriftung.
> Die PDF-Bibliothek jspdf belegt 337 kB im Startpaket, obwohl sie nur für einen einzigen Exportknopf gebraucht wird.
> Wandle den statischen Import von `jspdf` in einen dynamischen `await import('jspdf')` innerhalb der Export-Funktion um, sodass die Bibliothek erst beim Klick geladen wird.
> Die Oberfläche ändert sich an keiner Stelle.
> **Prüfung:** Restructuring öffnen, PDF-Export klicken — dieselbe Datei wie vorher entsteht. Messung: `npm run build`, Haupt-Chunk muss um mindestens 300 kB kleiner sein als vorher.

**P-R2-2 — Tabellen-Export erst beim Klick laden**
> Ändere ausschließlich `src/components/forecast/BillingMonthXlsExport.jsx`. Ändere nichts am Inhalt oder Aufbau der erzeugten Datei.
> Die Tabellenbibliothek xlsx belegt 280 kB im Startpaket für einen einzigen Exportknopf.
> Wandle den statischen Import von `xlsx` in ein `await import('xlsx')` innerhalb der Klick-Behandlung um.
> Die Oberfläche ändert sich an keiner Stelle.
> **Prüfung:** Forecast öffnen, Monats-Export klicken, Datei öffnen — Spalten und Werte wie vorher. Messung: `npm run build`, Haupt-Chunk um mindestens 250 kB kleiner.

**P-R2-3 — Die einzige moment-Stelle auf date-fns umstellen**
> Ändere ausschließlich die eine Datei, die `moment` importiert, und die Paketliste. Fasse keine andere Datei an.
> Das Projekt trägt zwei Datumsbibliotheken: date-fns an 28 Stellen und moment an genau einer. Moment kostet 61 kB im Startpaket.
> Ersetze den einen moment-Aufruf durch die entsprechende date-fns-Funktion und entferne `moment` aus der Paketliste. Die angezeigten Datumsangaben müssen exakt gleich formatiert bleiben.
> **Prüfung:** Die betroffene Seite öffnen und ein Datum mit dem vorherigen Zustand vergleichen — identische Schreibweise. Messung: `npm run build`, Haupt-Chunk um mindestens 55 kB kleiner.

### R3 — Datenabrufe begrenzen

**P-R3-1 — Grenze für die Abrufe der Projektübersicht**
> Ändere ausschließlich `src/pages/Projects.jsx`. Ändere keine Filterlogik, keine Spalte, keine Darstellung.
> Die Projektübersicht ruft fünf vollständige Datenbestände ohne Begrenzung ab (Zeilen 87–103). Solange die Datenmenge klein ist, fällt das nicht auf; sie wächst.
> Ergänze bei jedem dieser fünf Abrufe eine Sortierung nach `-created_date` und ein Limit von 500. Die sichtbare Liste und alle Zahlen müssen unverändert bleiben.
> **Prüfung:** Projekte öffnen — dieselben Projekte, dieselben Beträge, dieselben Filter wie vorher.

**P-R3-2 — Grenze für die Abrufe des Plan-Panels**
> Ändere ausschließlich `src/components/restructuring/plan/SuggestionRunPanel.jsx`. Ändere die Vorschlagslogik nicht.
> Dieses Panel lädt in einem Zug fünf vollständige Datenbestände (Rechnungen, Anweisungen, Aufträge, Projekte, Verträge) ohne jede Begrenzung.
> Ergänze bei allen fünf Abrufen Sortierung `-created_date` und ein Limit von 1000.
> **Prüfung:** Restructuring-Plan öffnen, Vorschlagslauf starten — gleiche Vorschläge wie vorher.

**P-R3-3 — Grenze für die Zählabrufe**
> Ändere ausschließlich `src/hooks/useUnlinkedOrdersCount.js` und höchstens zwei weitere Dateien unter `src/hooks/`. Ändere keine Anzeige.
> Mehrere Zähler in der Navigation laden den vollständigen Datenbestand, nur um Einträge zu zählen.
> Ergänze in diesen Abrufen ein Limit von 500 und, wo vorhanden, eine einschränkende Filterbedingung.
> **Prüfung:** Anwendung öffnen — die Zahlen an der Navigation stimmen mit dem vorherigen Stand überein.

### R4 — Zeitgeber und Neuzeichnungen

**P-R4-1 — Zeitgeber prüfen und aufräumen**
> Ändere ausschließlich `src/lib/sprint/useTimer.js` und `src/pages/Zeiten.jsx`. Ändere nichts an der Zeiterfassung, an keiner Berechnung und an keiner Anzeige.
> In diesen beiden Dateien laufen wiederkehrende Zeitgeber. Fehlt der Abbau beim Verlassen der Seite, tickt im Hintergrund Arbeit weiter.
> Prüfe jeden `setInterval` und stelle sicher, dass der zugehörige `useEffect` eine Aufräumfunktion mit `clearInterval` zurückgibt. Ändere nichts anderes.
> Die Oberfläche ändert sich an keiner Stelle.
> **Prüfung:** Zeiten öffnen, Timer starten, auf eine andere Seite wechseln und zurück — der Timer zeigt die richtige Zeit, die Seite bleibt flüssig.

### R5 — Große Dateien zerlegen

**P-R5-1 — Den Abrechnungsassistenten in Schritte zerlegen**
> Ändere ausschließlich `src/components/billing/BillingInstructionWizard.jsx` und lege neue Dateien unter `src/components/billing/wizard/` an. Ändere keine Feldbezeichnung, keine Berechnung, keinen Speichervorgang und keine Reihenfolge der Schritte.
> Diese Datei hat 1365 Zeilen und trägt sämtliche Schritte des Assistenten. Jede Änderung daran bewegt die ganze Datei und ist entsprechend riskant.
> Ziehe jeden Schritt in eine eigene Datei unter `wizard/`, die ihre Werte über Eigenschaften erhält und über Rückrufe zurückmeldet. Die Hauptdatei behält Zustand und Ablauf und soll unter 300 Zeilen liegen.
> Die Oberfläche ändert sich an keiner Stelle.
> **Prüfung:** Abrechnungsassistent vollständig durchlaufen und eine Anweisung speichern — gleiche Felder, gleiche Schritte, gleiches Ergebnis wie vorher.

**P-R5-2 — Die Projektdetail-Ansicht zerlegen**
> Voraussetzung: keine. Ändere ausschließlich `src/components/projects/ProjectDetailContent.jsx` und lege neue Dateien unter `src/components/projects/detail/` an. Ändere keine Berechnung und keine Datenabfrage.
> Diese Datei hat 808 Zeilen und trägt mehrere fachlich getrennte Blöcke.
> Ziehe die Blöcke in je eine eigene Datei unter `detail/` und lasse die Hauptdatei nur noch zusammensetzen; Ziel unter 250 Zeilen.
> Die Oberfläche ändert sich an keiner Stelle.
> **Prüfung:** Projektdetail eines aktiven Projekts öffnen und alle Blöcke von oben nach unten mit dem vorherigen Zustand vergleichen — identisch.

---

## 9. Reihenfolge

| Prompt | Aufwand | erwartete Entlastung | messbar woran | hängt ab von |
|---|---|---|---|---|
| P-R0-1 | klein | 26 Dateien / ~2.500 Zeilen weniger im Projekt, Bündel ±0 | Dateizahl unter src/ | — |
| P-R0-2 | klein | 15 Dateien weniger, Bündel ±0 | Dateizahl unter src/ | — |
| P-R0-3 | klein | node_modules ~40 MB kleiner, Bündel ±0 | `du -sm node_modules` | — |
| P-R1-1 | mittel | Haupt-Chunk 3,44 MB → ca. 2,7–2,9 MB | `npm run build`, <3,0 MB | — |
| P-R1-2 | mittel | ca. 2,8 MB → ca. 2,3–2,5 MB | `npm run build`, <2,5 MB | P-R1-1 |
| P-R1-3 | mittel | ca. 2,4 MB → ca. 1,4–1,6 MB | `npm run build`, <1,6 MB | P-R1-2 |
| P-R2-1 | klein | −337 kB im Startpaket | Haupt-Chunk −300 kB | — |
| P-R2-2 | klein | −280 kB im Startpaket | Haupt-Chunk −250 kB | — |
| P-R2-3 | klein | −61 kB im Startpaket | Haupt-Chunk −55 kB | — |
| P-R3-1 | klein | 5 unbegrenzte Abrufe → 5 begrenzte (max. 500) | Zahl der `.list()` ohne Limit: 97 → 92 | — |
| P-R3-2 | klein | 5 → 0 unbegrenzte Abrufe in dieser Datei | 92 → 87 | — |
| P-R3-3 | klein | 3 → 0 unbegrenzte Zählabrufe | 87 → 84 | — |
| P-R4-1 | klein | 2 Zeitgeber mit belegtem Abbau | `clearInterval` 10 → 12 | — |
| P-R5-1 | groß | größte Datei 1365 → unter 300 Zeilen | `wc -l` der Datei | P-R1-*, P-R2-* abgeschlossen |
| P-R5-2 | groß | 808 → unter 250 Zeilen | `wc -l` der Datei | P-R5-1 |

Summe R1+R2, wenn alles greift: **Haupt-Chunk 3,44 MB → etwa 0,7–0,9 MB roh**, gzip entsprechend etwa 250–300 kB. Das ist der Bereich, in dem die Vorschau wieder zuverlässig arbeiten sollte.