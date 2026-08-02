// Hilfsmittel des Sprint-Tageslaufs.
// Arbeitstage = Montag bis Freitag, keine Feiertagslogik.

export const parseIso = (s) => new Date(`${String(s).slice(0, 10)}T00:00:00Z`);

// Heutiges Datum in der Zeitzone der Agentur, nicht in UTC
export function todayInVienna() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Vienna' });
}

export function calendarDaysBetween(fromIso, toIso) {
  return Math.round((parseIso(toIso) - parseIso(fromIso)) / 86400000);
}

export function workdaysBetween(fromIso, toIso) {
  if (!fromIso || !toIso) return 0;
  const from = parseIso(fromIso);
  const to = parseIso(toIso);
  const sign = to < from ? -1 : 1;
  const start = sign > 0 ? from : to;
  const stop = sign > 0 ? to : from;
  let n = 0;
  const cur = new Date(start);
  while (cur < stop) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const wd = cur.getUTCDay();
    if (wd !== 0 && wd !== 6) n += 1;
  }
  return sign * n;
}

export const fmtDateDe = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
};

export function fillPlaceholders(text, vars) {
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.split(`{${k}}`).join(v == null ? '' : String(v)),
    String(text || '')
  );
}

// Standardvorlagen — werden beim ersten Lauf angelegt, danach ist die
// MailTemplate-Entität die Quelle und im System redaktionell änderbar.
export const TEMPLATE_DEFAULTS = {
  A2: {
    subject: 'Erinnerung: Rückmeldung zu {etappe} — {projekt}',
    body: 'Guten Tag,\n\nzur Etappe "{etappe}" im Projekt {projekt} liegt uns noch keine Rückmeldung vor.\n\nDie Rückmeldefrist endet am {frist} — das sind noch {resttage} Arbeitstage. Erhalten wir bis dahin keine Anmerkungen, gilt die Etappe als freigegeben und wir arbeiten auf dieser Grundlage weiter.\n\nFreundliche Grüße\nRittler & Co.',
    placeholders: ['kunde', 'projekt', 'etappe', 'frist', 'resttage'],
  },
  A3: {
    subject: 'Rückmeldefrist erreicht: {etappe} — {projekt}',
    body: 'Guten Tag,\n\ndie Rückmeldefrist zur Etappe "{etappe}" im Projekt {projekt} ist am {frist} abgelaufen.\n\nWir schließen die Etappe auf dem übergebenen Stand ab und setzen die Arbeit auf dieser Grundlage fort.\n\nFreundliche Grüße\nRittler & Co.',
    placeholders: ['kunde', 'projekt', 'etappe', 'frist', 'resttage'],
  },
  A4: {
    subject: 'Freigabe bestätigt: {etappe} — {projekt}',
    body: 'Guten Tag,\n\ndie Etappe "{etappe}" im Projekt {projekt} ist freigegeben. Grundlage: Ablauf der Rückmeldefrist am {frist} ohne Anmerkungen.\n\nDie weitere Lieferung erfolgt wie vereinbart.\n\nFreundliche Grüße\nRittler & Co.',
    placeholders: ['kunde', 'projekt', 'etappe', 'frist', 'resttage'],
  },
  A5: {
    subject: 'Sprint läuft aus: {projekt} ({kunde})',
    body: 'Der Sprint im Projekt {projekt} für {kunde} endet am {frist} — das sind noch {resttage} Arbeitstage.\n\nBitte den Abschluss vorbereiten und über einen Folgesprint entscheiden.',
    placeholders: ['kunde', 'projekt', 'etappe', 'frist', 'resttage'],
  },
};

// Vorlage laden oder beim ersten Lauf anlegen
export async function loadTemplate(base44, type, cache) {
  if (cache[type]) return cache[type];
  const found = await base44.asServiceRole.entities.MailTemplate.filter({ type }, '-created_date', 1);
  if (found.length > 0 && found[0].active !== false) {
    cache[type] = found[0];
    return found[0];
  }
  if (found.length > 0) {
    cache[type] = found[0];
    return found[0];
  }
  const created = await base44.asServiceRole.entities.MailTemplate.create({
    type,
    ...TEMPLATE_DEFAULTS[type],
    active: true,
  });
  cache[type] = created;
  return created;
}

/**
 * Mail versenden und protokollieren. Der Versand darf scheitern, ohne den Job
 * zu stoppen: dann bleibt der Log-Eintrag auf "vorgeschlagen", damit niemand
 * einen Versand annimmt, der nicht stattgefunden hat.
 */
export async function sendAndLog(base44, { type, recipient, subject, body, milestoneId, sprintId, projectId }, errors) {
  const now = new Date().toISOString();
  let status = 'versendet';
  try {
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: recipient,
      subject,
      body,
      from_name: 'Rittler & Co.',
    });
  } catch (e) {
    status = 'vorgeschlagen';
    errors.push(`${type} an ${recipient} konnte nicht versendet werden (${e.message}) — als Vorschlag protokolliert.`);
  }
  await base44.asServiceRole.entities.NotificationLog.create({
    type,
    milestone_id: milestoneId || undefined,
    sprint_id: sprintId || undefined,
    project_id: projectId || undefined,
    recipient,
    sent_at: now,
    subject,
    body,
    status,
  });
  return status;
}