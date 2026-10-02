// Suchindex aktuell halten — nach jeder gespeicherten Änderung (aufgerufen aus
// src/api/auditWrapper.js). Sammelt 1,5 s lang und schickt dann EINEN Aufruf an
// touchSearchIndex. Fehler werden verschluckt: die Bedienung darf davon nie
// blockiert werden; im schlimmsten Fall holt der nächtliche Neuaufbau den Stand nach.
//
// Bewusst ohne Import des Base44-Clients (der Client importiert den Wrapper):
// die Aufruffunktion wird übergeben.

export const SUCHRELEVANT = new Set([
  'Client', 'Project', 'Ticket', 'Sprint', 'LiquidityProject', 'ConfirmedOrder',
  'CrmProposal', 'CrmDeal', 'InvoiceRecord', 'BillingInstruction', 'RecurringContract', 'ProjectFileEntry',
]);

const MAX_JE_AUFRUF = 50;
const MAX_JE_BUENDEL = 200; // mehr (z. B. Import) holt der Neuaufbau nach
let warteschlange = new Map();
let zeitgeber = null;

export function suchindexAuffrischen(aufrufen, entity, ids) {
  if (!SUCHRELEVANT.has(entity) || typeof aufrufen !== 'function') return;
  (Array.isArray(ids) ? ids : [ids]).filter(Boolean).forEach((id) => {
    if (warteschlange.size < MAX_JE_BUENDEL) warteschlange.set(`${entity}:${id}`, { entity, id: String(id) });
  });
  if (!warteschlange.size || zeitgeber) return;
  zeitgeber = setTimeout(() => {
    const alle = Array.from(warteschlange.values());
    warteschlange = new Map();
    zeitgeber = null;
    for (let i = 0; i < alle.length; i += MAX_JE_AUFRUF) {
      Promise.resolve()
        .then(() => aufrufen('touchSearchIndex', { eintraege: alle.slice(i, i + MAX_JE_AUFRUF) }))
        .catch(() => {});
    }
  }, 1500);
}

// Welche Datensätze hat eine Speicherung berührt? (Ids aus Argumenten bzw. Ergebnis.)
export function betroffeneIds(methode, args, ergebnis) {
  if (methode === 'create') return [ergebnis?.id];
  if (methode === 'update' || methode === 'delete') return [args[0]];
  if (methode === 'bulkCreate') return Array.isArray(ergebnis) ? ergebnis.map((r) => r?.id) : [];
  if (methode === 'bulkUpdate') return Array.isArray(args[0]) ? args[0].map((r) => r?.id) : [];
  return []; // updateMany/deleteMany: keine Ids — der Neuaufbau holt das nach
}
