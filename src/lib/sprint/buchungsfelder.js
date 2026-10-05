import { base44 } from '@/api/base44Client';
import { projectTypeOf } from '@/components/sprint/projectTypes';

export const KATEGORIE_TEXT = {
  sprint: 'Sprint · zählt gegen das Sprintbudget',
  support: 'Support · zählt gegen das Kontingent',
  aufwand: 'Nach Aufwand · wird fakturiert',
  paket: 'Retainer · zählt gegen das Kontingent',
  intern: 'Intern · nicht abrechenbar',
};

// Sprint, dem eine Buchung zugeordnet wird: der laufende (bei mehreren der mit dem
// frühesten Liefertermin). Läuft noch keiner, zählt die Zeit zum nächsten geplanten
// Sprint — Arbeit vor dem Start darf nicht ohne Sprint-Zuordnung bleiben.
// Dieselbe Regel gilt in den Funktionen zeitStoppen und projektZeitSummen.
export const laufenderSprint = (sprints = []) => {
  const laufend = sprints
    .filter((s) => s.status === 'laufend')
    .sort((a, b) => (a.delivery_date || '9999-12-31').localeCompare(b.delivery_date || '9999-12-31'))[0];
  if (laufend) return laufend;
  return sprints
    .filter((s) => s.status === 'geplant')
    .sort((a, b) => (a.start_date || '9999-12-31').localeCompare(b.start_date || '9999-12-31'))[0] || null;
};

// Container, Support, Regie: liegt die Buchung über dem Monatskontingent bzw. -rahmen?
// ohneId: bei Änderungen die ursprüngliche Buchung nicht mitzählen.
export async function ueberKontingentPruefen({ projectId, tag, minuten, ohneId }) {
  const project = await base44.entities.Project.get(projectId);
  if (!['container', 'support', 'regie', 'intern'].includes(projectTypeOf(project))) return false;
  const kontingent = Number(project.support_kontingent_stunden) || 0;
  if (!kontingent) return false;
  const monat = String(tag || '').slice(0, 7);
  const rows = await base44.entities.TimeEntry.filter({ project_id: projectId }, '-entry_date', 500);
  const bisher = rows
    .filter((r) => r.id !== ohneId && String(r.entry_date || '').slice(0, 7) === monat)
    .reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0);
  return bisher + (Number(minuten) || 0) > kontingent * 60;
}

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const fmtStd = (n) => (Math.round(n * 100) / 100).toLocaleString('de-DE', { maximumFractionDigits: 2 });

// Buchungssperre: nur wenn ein Admin sie am Projekt eingeschaltet hat und ein Kontingent besteht.
// Jeder Kalendermonat beginnt wieder bei null. Werte in Stunden.
export async function kontingentGesperrt({ projectId, tag, minuten, ohneId }) {
  const project = await base44.entities.Project.get(projectId);
  const kontingent = Number(project.support_kontingent_stunden) || 0;
  const monat = String(tag || '').slice(0, 7);
  if (!project.kontingent_sperre || !(kontingent > 0)) {
    return { gesperrt: false, kontingent, gebucht: 0, rest: kontingent, project, monat };
  }
  const rows = await base44.entities.TimeEntry.filter({ project_id: projectId }, '-entry_date', 1000);
  const bisher = rows
    .filter((r) => r.id !== ohneId && String(r.entry_date || '').slice(0, 7) === monat)
    .reduce((s, r) => s + (Number(r.duration_minutes) || 0), 0);
  return {
    gesperrt: bisher + (Number(minuten) || 0) > kontingent * 60,
    kontingent,
    gebucht: bisher / 60,
    rest: Math.max(0, kontingent - bisher / 60),
    project,
    monat,
  };
}

// Meldung für den Kollegen, wenn eine Buchung an der Sperre scheitert.
export async function sperrMeldung({ project, monat, gebucht, kontingent, rest }) {
  const pm = project.pm_email
    ? (await base44.entities.TeamMember.filter({ email: project.pm_email }, 'name', 1).catch(() => []))[0]
    : null;
  const name = pm?.name || project.pm_email || 'der Projektleitung';
  const mName = MONATE[Number(String(monat).slice(5, 7)) - 1] || monat;
  const voll = `Das Kontingent von ${project.title} für ${mName} ist verbraucht (${fmtStd(gebucht)} von ${fmtStd(kontingent)} h). Buchungen sind gesperrt — bitte bei ${name} melden.`;
  return rest > 0 ? `${voll} Es sind nur noch ${fmtStd(rest)} h frei.` : voll;
}

// Prüft die Sperre für eine neue oder geänderte Buchung.
// Nicht-Admins: Fehler mit Meldung. Admins: Fehler mit bestaetigen=true, solange nicht trotzdem.
// Rückgabe true = Admin bucht trotz Sperre (ueber_kontingent setzen).
export async function sperreDurchsetzen({ projectId, tag, minuten, ohneId, trotzdem }) {
  if (!(Number(minuten) > 0)) return false;
  const info = await kontingentGesperrt({ projectId, tag, minuten, ohneId });
  if (!info.gesperrt) return false;
  const me = await base44.auth.me().catch(() => null);
  if (me?.role !== 'admin') {
    throw Object.assign(new Error(await sperrMeldung(info)), { sperre: true });
  }
  if (!trotzdem) {
    throw Object.assign(new Error('Kontingent verbraucht — trotzdem buchen?'), { bestaetigen: true });
  }
  return true;
}

// Alle Pflichtfelder einer Buchung — ohne jede Auswahl durch den Nutzer.
export async function ermittleBuchungsfelder(projectId) {
  const [project, sprints] = await Promise.all([
    base44.entities.Project.get(projectId),
    base44.entities.Sprint.filter({ project_id: projectId }, 'delivery_date', 50),
  ]);
  const kategorie = project.abrechnungsmodell || 'sprint';
  const sprint = laufenderSprint(sprints);

  let stundensatz;
  if (kategorie === 'aufwand') {
    if (project.stundensatz) {
      stundensatz = project.stundensatz;
    } else {
      const settings = await base44.entities.Setting.filter({ key: 'standard_stundensatz' }, 'key', 1);
      stundensatz = Number(settings[0]?.value) || undefined;
    }
  }

  return {
    client_id: project.client_id || '',
    project_id: projectId,
    sprint_id: sprint?.id || '',
    kategorie,
    verrechenbar: kategorie !== 'intern',
    abrechenbar: kategorie !== 'intern',
    ...(kategorie === 'intern' ? { nicht_verrechenbar_grund: 'intern' } : {}),
    abrechnungsstatus: 'offen',
    ...(stundensatz ? { stundensatz } : {}),
  };
}