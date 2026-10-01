const NICHT_NEU_LADEN = new Set([
  'me', 'confirmedOrders', 'dunningRecords', 'posteingang',
  'crm-new-deals', 'email-escalations',
  'crm-escalations', 'moduleTemplates', 'ticketTemplates',
  'laufendeZeitbuchung', 'aworkSnapshots', 'openAworkTasks',
  'aworkTimeEntries',
]);

export function ladeAnsichtenNachTicketAenderung(queryClient) {
  return queryClient.invalidateQueries({
    predicate: (q) => !NICHT_NEU_LADEN.has(q.queryKey?.[0]),
  });
}