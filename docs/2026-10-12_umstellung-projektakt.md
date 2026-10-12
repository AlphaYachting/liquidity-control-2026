# Umstellung Kundenakt → Projektakt (12.10.2026)

Entscheidung Alfons: Der Projektakt hängt immer am Arbeitsprojekt (Project.id), nie am Projekt-Cockpit.
Name „Projektakt" (nicht „Projektakte" — kollidiert mit der aWork-Altakte; nicht „Projektinformationen" — zu allgemein).

## Datenumstellung ProjectFileEntry (alt → neu)

| Eintrag | Titel | project_id alt (Cockpit) | project_id neu (Arbeitsprojekt) |
|---|---|---|---|
| 6acc3175558452c2f6c1fdbb | Nachtragsangebot Stein von Grein | 6a2a776e68f5bce5d328c6af | 6ac11227f0baed5319e182de |
| 6ac35989554a0b7a4d242fe6 | Korrekturschleife Serifenschrift | 6a2a776e68f5bce5d328c6af | 6ac11227f0baed5319e182de |
| 6ac20dbc181552b31a570fea | Neues Header-Konzept (MOONS) | 6a958e0ef995604f7ff97284 | 6ac11227f0baed5319e182ec |
| 6abf6990e971cca49cb61734 | Auftragsumfang laut Angebot (YOUR OFFICE, verwaist) | 6abf698895121b3a6d696c27 (gelöschtes Cockpit) | 6abf6987ac8cf5baa1d57ccc |
| 6a8c45dfc8ce36e39d092182 | Abnahmeprozess OSG | 6a2a77d9e84c079c50f6c236 | 6ac11227f0baed5319e182e1 |
| 6a8b138620b9d43554477e3b | Nachweis Leistungserbringung Zircless | 6a2a78c954f1b24ddf608e56 | 6ac11227f0baed5319e182df |
| 6a7ebe2847ea1a685c0d580d | AB Imagebroschüre OFF-2026-0135 (AVI) | 6a2a7ad8c7e0b5ceec60d09f | 6ac11227f0baed5319e182d5 |
| 6a7ebddf6c547c183d10a32f | Umsatzbericht Imagebroschüre (AVI) | 6a2a7ad8c7e0b5ceec60d09f | 6ac11227f0baed5319e182d5 |
| 6abdec05f1f2f57492696577 | Kontext aus der Anfrage (AUSTRO DENT) | — (lag schon am Arbeitsprojekt 6abdec031d1bace85d28cdcf) | unverändert |

## Datenumstellung ProjektIntelligenzGespraech (Cockpit → Arbeitsprojekt)

| Cockpit alt | Arbeitsprojekt neu |
|---|---|
| 6a2a776e68f5bce5d328c6af | 6ac11227f0baed5319e182de (Stein von Grein) |
| 6a2a7b1e0f5c99b74b8dbc23 | 6ac11227f0baed5319e182f0 (Brüder Rath) |
| 6a2a77d9e84c079c50f6c236 | 6ac11227f0baed5319e182e1 (OSG) |
| 6ac48d75f3484bbf64d1fb66 | 6abf6987ac8cf5baa1d57ccc (YOUR OFFICE Corporate Anpassung) |
| 6abf698895121b3a6d696c27 | 6abf6987ac8cf5baa1d57ccc (gelöschtes Cockpit, YOUR OFFICE) |
| 6a2a7822c0399e8670a72347 | 6ac11227f0baed5319e182e6 (SFL) |
| 6a979c9ceeebcc3f6904fe58 | 6ac11227f0baed5319e182cf (Artsip) |
| 6a979f1d122bf427dff0a00f | 6ac11227f0baed5319e182db (C&P Seeresort) |
| 6a26a9e326f038b87ff083f4 | 6ac11227f0baed5319e182ee (Vision Decision) |
| 6a958e0ef995604f7ff97284 | 6ac11227f0baed5319e182ec (MOONS) |
| 6a29323b536a94bd1aa8077a | 6ac11227f0baed5319e182f8 (CHIC COFI) |
| 6a2a7ad8c7e0b5ceec60d09f | 6ac11227f0baed5319e182d5 (AVI) |
| 6a4c9489a1e48125e8d31454 | 6ac11227f0baed5319e182d2 (YOUR OFFICE Optimierung) |

Unverändert (lagen schon am Arbeitsprojekt): 6abe9fb280c6211c64b7e99b, 6ac11275cac1a477377fa0e2, 6abdec031d1bace85d28cdcf.
Unverändert (Cockpit ohne Arbeitsprojekt): 6a2a72cdc907e45df1a1e0c4, 6a9fc19de470c54e5c4ed757.

Rückweg: dieselben Zuordnungen in umgekehrter Richtung; Code-Stand vor der Umstellung = Checkpoint „Vor Umstellung Kundenakt → Projektakt".
