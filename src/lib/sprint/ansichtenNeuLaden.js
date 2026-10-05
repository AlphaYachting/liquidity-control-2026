const NICHT_NEU_LADEN = new Set([
  'me', 'confirmedOrders', 'dunningRecords', 'posteingang',
  'crm-new-deals', 'email-escalations',
  'crm-escalations', 'moduleTemplates', 'ticketTemplates',
  'laufendeZeitbuchung', 'aworkSnapshots', 'openAworkTasks',
  'aworkTimeEntries',
  // Ändern sich durch eine Ticket-Änderung nicht — laufen auf jeder Seite und
  // würden sonst bei jedem Klick mitgeladen (Zugriff, Stammdaten, Zähler).
  // NICHT hier: 'uebernahme', 'support-tickets', 'sprintHeute', 'ticketHours' —
  // die hängen an Tickets und müssen nach einer Änderung frisch sein.
  'team-profile', 'zugriff-person', 'zeitStammdaten', 'pflichtAb', 'offeneTage',
  'rueckmeldungen-neu', 'rueckmeldungen-eigene', 'email-triage-count', 'crm-inbox-badge',
]);

export function ladeAnsichtenNachTicketAenderung(queryClient) {
  return queryClient.invalidateQueries({
    predicate: (q) => !NICHT_NEU_LADEN.has(q.queryKey?.[0]),
  });
}