import { base44 } from '@/api/base44Client';

// Ruft die Server-Funktion ticketBereinigen in Blöcken auf und fasst die Antworten zusammen.
// Fehlermeldungen des Servers (403, 400 …) kommen als Error mit lesbarem Text zurück.
export async function ticketBereinigen(aktion, ticketIds, grund) {
  const ids = [...new Set(ticketIds)];
  const ergebnis = { erledigt: [], abgelehnt: [], tickets: [] };
  for (let i = 0; i < ids.length; i += 50) {
    let res;
    try {
      res = await base44.functions.invoke('ticketBereinigen', { aktion, ticket_ids: ids.slice(i, i + 50), grund });
    } catch (e) {
      throw new Error(e?.response?.data?.error || e?.message || 'Aktion fehlgeschlagen');
    }
    const d = res?.data || {};
    if (d.error) throw new Error(d.error);
    ergebnis.erledigt.push(...(d.erledigt || []));
    ergebnis.abgelehnt.push(...(d.abgelehnt || []));
    ergebnis.tickets.push(...(d.tickets || []));
  }
  return ergebnis;
}

// Darf der angemeldete Nutzer im Projekt archivieren (Projektverantwortlicher oder Admin)?
export const darfBereinigen = (me, project) =>
  !!me && (me.role === 'admin' || (!!project?.pm_email && project.pm_email.toLowerCase() === (me.email || '').toLowerCase()));
