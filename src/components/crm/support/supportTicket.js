import { base44 } from '@/api/base44Client';
import { threadIdOf, eintragAendern } from '@/components/crm/inboxDecision';
import { emailApi } from '@/components/crm/emails/emailApi';
import { ensureContainer } from '@/lib/sprint/ensureContainer';
import { findeKunde } from '@/lib/kunden/kundeAnlegen';
import { threadTranscript, ohneZitat, istSystemMail } from '@/components/crm/support/threadDescription';
import { formatMailDate } from '@/components/crm/emails/emailConfig';
import { alsDatum } from '@/lib/zeitpunkt';
import { faelligAm } from '@/components/crm/support/faelligkeit';
import { zustaendigFelder } from '@/lib/sprint/zustaendige';

export const SUPPORT_MODELS = ['aufwand', 'support'];
export const DEFAULT_SUPPORT_RATE = 130;

const supportTitle = (customer) => `Support — ${customer}`;

// Behälter (Sprint + offener Milestone) am Support-Projekt sicherstellen —
// ohne Liefertermin, ohne Etappenbetrag.
async function ensureSupportContainer(project) {
  const { milestone } = await ensureContainer(project, {
    sprintTitle: 'Laufender Support',
    milestoneTitle: 'Support-Anfragen',
  });
  return milestone;
}

// Ein dauerhaftes Support-Projekt je Kunde — bestehendes wird immer wiederverwendet.
// Gesucht wird nach Kunde (Client) und Abrechnungsmodell 'aufwand' oder 'support',
// erst danach wird das PROJEKT angelegt. Ein Kunde wird hier nie angelegt — neue
// Kunden entstehen ausschließlich im Kundenverzeichnis (mit sevDesk-Verknüpfung).
export async function resolveSupportProject(customerName, options = {}) {
  const customer = String(customerName || '').trim();
  if (!customer) throw new Error('Für ein Support-Ticket braucht es einen Kunden.');

  const { pmEmail = '', stundensatz, projectId } = options;

  // Im Dialog ausdrücklich gewähltes Support-Projekt gilt direkt
  let project = projectId ? await base44.entities.Project.get(projectId).catch(() => null) : null;
  const client = project ? null : await findeKunde(customer);

  if (!project && client) {
    const byClient = await base44.entities.Project.filter({ client_id: client.id });
    // Regie-Aufträge nie als Support-Projekt wiederverwenden
    const kandidaten = byClient.filter(p => SUPPORT_MODELS.includes(p.abrechnungsmodell) && p.aufwand_art !== 'regie');
    project = kandidaten.find(p => p.status !== 'abgeschlossen')
      || kandidaten[0]
      || null;
  }
  if (!project) {
    project = (await base44.entities.Project.filter({ title: supportTitle(customer) })).find(p => p.aufwand_art !== 'regie') || null;
  }

  if (!project) {
    if (!client) {
      throw new Error(`Den Kunden „${customer}" gibt es noch nicht — bitte einen bestehenden Kunden wählen oder ihn zuerst im Kundenverzeichnis anlegen.`);
    }
    project = await base44.entities.Project.create({
      client_id: client.id,
      title: supportTitle(customer),
      pm_email: pmEmail,
      status: 'aktiv',
      abrechnungsmodell: 'aufwand',
      aufwand_art: 'support',
      stundensatz: Number(stundensatz) || DEFAULT_SUPPORT_RATE,
    });
  } else if (stundensatz && !project.stundensatz && SUPPORT_MODELS.includes(project.abrechnungsmodell)) {
    // Stundensatz nur bei Support-/Aufwandsprojekten nachtragen — ein Retainer oder Pauschalprojekt,
    // in das eine Anfrage bewusst abgelegt wird, bekommt keinen Support-Satz.
    await base44.entities.Project.update(project.id, { stundensatz: Number(stundensatz) });
  }

  const milestone = await ensureSupportContainer(project);
  return { project, project_id: project.id, milestone_id: milestone.id };
}

// Offene Tickets zu einer E-Mail-Konversation (Doppelticket-Schutz, 21.10.2026).
// Erledigte zählen nicht: eine neue Nachricht nach Abschluss ist meist ein neuer Auftrag.
export async function offeneTicketsZurKonversation(item) {
  const threadId = threadIdOf(item);
  if (!threadId) return [];
  const tickets = await base44.entities.Ticket.filter({ source_thread_id: String(threadId) }, '-created_date', 20).catch(() => []);
  return tickets.filter((t) => !t.archiviert && t.status !== 'erledigt');
}

// Neue Nachricht an ein bestehendes offenes Ticket hängen statt ein zweites anzulegen:
// die seit dem Anlegen eingegangenen Mails als Kommentar ins Ticket, ein wartendes Ticket
// wird wieder offen, Posteingang und E-Mail-Datenbank werden wie beim Anlegen geschlossen.
export async function anTicketAnhaengen({ item, ticket }) {
  const threadId = threadIdOf(item);
  // Beide Zeitpunkte sind UTC ohne Zonenangabe — als Zeitpunkt vergleichen, nicht als Text
  const seit = alsDatum(ticket.created_date)?.getTime() || 0;
  const mailZeit = (s) => new Date(`${String(s || '').slice(0, 19).replace(' ', 'T')}Z`).getTime() || 0;
  let text = '';
  if (threadId) {
    const data = await emailApi('thread', { params: { id: threadId, msgs: 30, full: 1 } }).catch(() => null);
    const neu = (data?.messages || [])
      .filter((m) => !istSystemMail(m) && mailZeit(m.received_at) > seit)
      .sort((a, b) => mailZeit(a.received_at) - mailZeit(b.received_at));
    text = neu.map((m) => {
      const kopf = `${m.from_name || m.from || 'Unbekannt'} · ${formatMailDate(m.received_at)} · ${m.direction === 'in' ? 'eingehend' : 'ausgehend'}`;
      return `${kopf}\n${ohneZitat(String(m.text || m.preview || '').trim())}`;
    }).join('\n\n---\n\n');
  }
  if (!text && item.body) text = String(item.body).trim();
  const kommentar = [
    'Neue Nachricht in derselben E-Mail-Konversation — an dieses Ticket angehängt, statt ein zweites anzulegen.',
    text ? text.slice(0, 8000) : '',
    threadId ? `Konversation: /crm/emails?thread=${threadId}` : '',
  ].filter(Boolean).join('\n\n');
  const me = await base44.auth.me().catch(() => null);
  await base44.entities.Comment.create({
    project_id: ticket.project_id,
    milestone_id: ticket.milestone_id || undefined,
    ticket_id: ticket.id,
    author_email: me?.email || 'System',
    text: kommentar,
    created_at: new Date().toISOString(),
  });
  if (ticket.status === 'wartet') {
    await base44.entities.Ticket.update(ticket.id, { status: 'offen', last_status_change: new Date().toISOString() });
  }

  let hinweis = '';
  if (item.id) {
    try {
      await eintragAendern(item.id, { status: 'converted', decision: 'zugeordnet', linked_ticket_id: ticket.id });
    } catch (e) {
      hinweis = `Der Posteingangs-Eintrag konnte nicht geschlossen werden (${e?.message || 'unbekannter Fehler'}).`;
    }
  }
  let back = { ok: true };
  if (threadId) {
    try {
      await emailApi('enrich', {
        thread_id: threadId,
        fields: { crm_status: 'supportticket_angelegt', crm_ticket_id: ticket.id, status: 'beantwortet' },
      });
    } catch (e) {
      back = { ok: false, error: e?.message || 'unbekannter Fehler' };
    }
  }
  await eskalationenSchliessen(threadId, ticket);
  return { ticket, back, hinweis, angehaengt: true };
}

// Support-Anfrage in ein Ticket überführen — es entsteht KEINE Rechnung.
// Zeitfenster, in dem ein zweites Ticket zur selben Konversation als Doppelklick gilt
const DOPPELT_MINUTEN = 15;

// Regel (28.10.2026): Eine E-Mail, die in ein Ticket umgewandelt wird, verschwindet — auch aus den
// Kunden-Eskalationen. Alle offenen Eskalations-Vorgänge der Konversation (auch in Parallel-Verläufen)
// werden mit Verweis auf das Ticket geschlossen. Best-Effort: das Ticket steht in jedem Fall.
async function eskalationenSchliessen(threadId, ticket) {
  if (!threadId || !ticket?.id) return;
  try {
    const zeile = (await base44.entities.EmailThreadIndex.filter({ thread_id: String(threadId) }, '-indexed_at', 1).catch(() => []))[0];
    const verlaeufe = zeile?.conversation_key
      ? (await base44.entities.EmailThreadIndex.filter({ conversation_key: zeile.conversation_key }, '-last_message_at', 50).catch(() => []))
        .map((z) => String(z.thread_id))
      : [];
    const ids = [...new Set([String(threadId), ...verlaeufe])];
    const faelle = await base44.entities.CrmEscalation
      .filter({ thread_id: { $in: ids }, state: { $ne: 'erledigt' } }, '-created_at', 50)
      .catch(() => []);
    await Promise.all(faelle.map((f) => base44.entities.CrmEscalation.update(f.id, {
      state: 'erledigt',
      linked_ticket_id: ticket.id,
      resolved_at: new Date().toISOString(),
      resolution_note: `In Support-Ticket umgewandelt: „${ticket.title || ''}“`,
    })));
  } catch (_e) { /* Ticket steht — Eskalation notfalls von Hand schließen */ }
}

// Wartet höchstens `ms` Millisekunden — danach gilt der Wert als nicht geladen (statt endlos zu hängen)
const mitZeitlimit = (promise, ms, ersatz) => Promise.race([
  promise,
  new Promise((resolve) => { setTimeout(() => resolve(ersatz), ms); }),
]);
const VERLAUF_ZEITLIMIT_MS = 20000;

// Rückgabe: { ticket, back: { ok, error? }, hinweis? }
export async function createSupportTicket({ item, projectId, milestoneId, values, onSchritt }) {
  const threadId = threadIdOf(item);
  const schritt = (t) => { try { onSchritt?.(t); } catch (_e) { /* nur Anzeige */ } };

  // Schutz vor Doppelanlage: Eintrag schon übernommen, oder zur Konversation gerade ein Ticket angelegt?
  if (item.id) {
    const frisch = await base44.entities.CrmInboxItem.get(item.id).catch(() => null);
    if (frisch && frisch.status !== 'new') {
      throw new Error('Diese Anfrage wurde bereits übernommen — bitte die Liste neu laden.');
    }
  }
  if (threadId) {
    const grenze = Date.now() - DOPPELT_MINUTEN * 60 * 1000;
    const vorhanden = await base44.entities.Ticket.filter({ source_thread_id: String(threadId) }, '-created_date', 10).catch(() => []);
    const gerade = vorhanden.find((t) => !t.archiviert && new Date(t.created_date).getTime() >= grenze);
    if (gerade) {
      throw new Error(`Zu dieser Konversation wurde gerade das Ticket „${gerade.title}“ angelegt — es wird kein zweites angelegt.`);
    }
  }
  const threadLink = threadId ? `/crm/emails?thread=${threadId}` : '';

  // Entsteht das Ticket aus einer E-Mail, wandert der Verlauf ins Ticket — wer das Ticket bearbeitet,
  // soll nicht in die E-Mail-Zentrale wechseln müssen. Die Datenbank begrenzt die Feldgröße: zitierter
  // Altverlauf wird je Mail ausgeblendet, bei sehr langen Verläufen fallen die ältesten Mails weg
  // (Hinweis + Link zur Konversation stehen im Ticket). Fehler 06.10.2026 bei 4control.
  const baueBeschreibung = async (maxVerlauf) => {
    let verlauf = '';
    let gekuerzt = false;
    if (threadId) {
      schritt('E-Mail-Verlauf wird übernommen …');
      verlauf = await mitZeitlimit(
        threadTranscript(threadId, { ohneZitate: true, maxZeichen: maxVerlauf }).catch(() => ''),
        VERLAUF_ZEITLIMIT_MS,
        '',
      );
      // Der Dialog-Text ist meist die KI-Kurzfassung — die Original-Mail muss trotzdem ins Ticket
      if (!verlauf && item.body) verlauf = String(item.body).trim().slice(0, maxVerlauf);
      // Lädt der Verlauf nicht rechtzeitig, reicht der Text aus dem Dialog — mit Hinweis und Link
      if (!verlauf && String(values.description || '').trim()) gekuerzt = true;
      if (!verlauf && !gekuerzt && (item.source === 'email' || !item.id)) {
        throw new Error('Der E-Mail-Verlauf konnte nicht geladen werden — das Ticket wurde nicht angelegt. Bitte noch einmal versuchen.');
      }
    }
    // Ohne Konversation (z. B. Posteingang ohne Thread): Originaltext der Anfrage unter die Kurzfassung
    const kurz = String(values.description || '').trim();
    const original = !threadId && item.body && String(item.body).trim() !== kurz
      ? String(item.body).trim().slice(0, maxVerlauf)
      : '';
    return [
      kurz.slice(0, 8000),
      verlauf ? `— E-Mail-Verlauf —\n\n${verlauf}` : '',
      original ? `— Ursprüngliche Anfrage —\n\n${original}` : '',
      gekuerzt ? '[Der vollständige E-Mail-Verlauf konnte beim Anlegen nicht geladen werden — siehe Konversation.]' : '',
      threadLink ? `Konversation: ${threadLink}` : '',
    ].filter(Boolean).join('\n\n');
  };

  const ticketDaten = (beschreibung) => ({
    project_id: projectId,
    milestone_id: milestoneId,
    title: values.title,
    description: beschreibung,
    role: values.role,
    target_hours: Number(values.target_hours) || 0,
    ...zustaendigFelder(values.assignee_email ? [values.assignee_email] : []),
    origin: 'support',
    status: 'offen',
    // Jedes Support-Ticket hat eine Fälligkeit: 4 Tage, bei dringender Störung sofort
    planned_for: values.planned_for || faelligAm(false),
    source_thread_id: threadId ? String(threadId) : '',
    customer_name: values.customer || '',
    // Mehrere Anliegen aus der E-Mail → To-dos zum Abhaken (KI-Vorschlag, im Dialog geprüft)
    checklist: (values.checklist || [])
      .map((c) => ({ text: String(c?.text || '').trim().slice(0, 300), done: !!c?.done }))
      .filter((c) => c.text),
  });

  let ticket;
  const beschreibung = await baueBeschreibung(20000);
  schritt('Ticket wird gespeichert …');
  try {
    ticket = await base44.entities.Ticket.create(ticketDaten(beschreibung));
  } catch (e) {
    const text = `${e?.response?.data?.detail || e?.response?.data?.message || e?.message || ''}`;
    if (!/maximum allowed size|too large|exceeds/i.test(text)) throw e;
    // Immer noch zu groß: deutlich kürzer, die jüngsten Mails bleiben drin
    ticket = await base44.entities.Ticket.create(ticketDaten(await baueBeschreibung(6000)));
  }

  // Nur wenn die Anfrage aus dem Posteingang stammt — Threads aus der E-Mail-Zentrale
  // haben keinen Posteingangs-Eintrag. Das Ticket steht ab hier: Scheitert nur das Schließen
  // des Eintrags, wird das gemeldet, aber nicht als Fehler geworfen (sonst klickt man erneut
  // und legt ein zweites Ticket an).
  let hinweis = '';
  if (item.id) {
    try {
      await eintragAendern(item.id, { status: 'converted', decision: 'zugeordnet', linked_ticket_id: ticket.id });
    } catch (e) {
      hinweis = `Der Posteingangs-Eintrag konnte nicht geschlossen werden (${e?.message || 'unbekannter Fehler'}).`;
    }
  }

  // Rückkanal in die E-Mail-Datenbank — der Thread verlässt „braucht Entscheidung"
  let back = { ok: true };
  if (threadId) {
    schritt('Posteingang wird aktualisiert …');
    try {
      await emailApi('enrich', {
        thread_id: threadId,
        fields: {
          crm_status: 'supportticket_angelegt',
          crm_ticket_id: ticket.id,
          status: 'beantwortet',
        },
      });
    } catch (e) {
      back = { ok: false, error: e?.message || 'unbekannter Fehler' };
    }
  }
  // E-Mail ist jetzt Ticket — offene Eskalationen dieser Konversation verschwinden
  await eskalationenSchliessen(threadId, ticket);

  return { ticket, back, hinweis };
}