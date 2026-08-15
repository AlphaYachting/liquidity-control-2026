// Kunden-Eskalation: aus der KI-Stufe wird ein nachvollziehbarer Vorgang in der App.
export const ESCALATION_LEVELS = ['keine', 'stufe1', 'stufe2', 'stufe3'];

export function severityOf(level) {
  const i = ESCALATION_LEVELS.indexOf(String(level || 'keine'));
  return i > 0 ? i : 0;
}

// Zweitschrift je Thread: Severity/Beleg werden aktualisiert, der Bearbeitungsstand
// (state, assigned_to, snooze, Notiz) bleibt unangetastet.
export async function upsertEscalation(db, { threadId, subject, customerName, severity, evidence }) {
  const existing = (await db.CrmEscalation.filter({ thread_id: String(threadId) }))[0];
  const data = {
    subject: String(subject || '').slice(0, 200),
    customer_name: customerName || '',
    severity,
    evidence: String(evidence || '').slice(0, 500),
  };

  if (existing) {
    await db.CrmEscalation.update(existing.id, data);
    return { escalation: existing, created: false };
  }

  const escalation = await db.CrmEscalation.create({
    thread_id: String(threadId),
    state: 'offen',
    created_at: new Date().toISOString(),
    ...data,
  });

  // Benachrichtigung nach bestehendem NotificationLog-Muster — ab Stufe 2
  if (severity >= 2) {
    const team = await db.TeamMember.filter({ active: true }, 'name', 100);
    const gf = team.filter((m) => m.system_role === 'gf').map((m) => m.email);
    const recipients = gf.length ? gf : [];
    for (const recipient of recipients) {
      await db.NotificationLog.create({
        type: 'E1',
        recipient,
        sent_at: new Date().toISOString(),
        subject: `Kunden-Eskalation Stufe ${severity}: ${data.customer_name || data.subject || 'unbekannt'}`,
        body: `${data.subject || ''}\n\nBeleg: ${data.evidence || '—'}\n\nVorgang: /crm/escalations`,
        status: 'vorgeschlagen',
      });
    }
  }

  return { escalation, created: true };
}