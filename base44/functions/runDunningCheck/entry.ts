import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

// Mahnstufen-Logik (Basis: Erstversanddatum der Rechnung):
// >= 14 Tage → Stufe 1: Zahlungserinnerung
// >= 21 Tage → Stufe 2: 1. Mahnung (mit Anrufeskalations-Hinweis)
// >= 28 Tage → Stufe 3: 2. Mahnung
const LEVELS = [
  { level: 1, minDays: 14, label: 'Zahlungserinnerung' },
  { level: 2, minDays: 21, label: '1. Mahnung' },
  { level: 3, minDays: 28, label: '2. Mahnung' },
];

async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk GET error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sevdeskPost(path, apiKey, body) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    method: 'POST',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sevDesk POST error ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

async function sevdeskPut(path, apiKey, body) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`sevDesk PUT error ${res.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : null;
}

function parseAmount(val) {
  return parseFloat(val || '0') || 0;
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const today0Iso = () => new Date().toISOString().slice(0, 10);

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const user = await base44.auth.me().catch(() => null);

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const dryRun = body.dry_run === true;

    // 1. Offene + teilbezahlte Rechnungen aus sevDesk holen (paginiert)
    async function fetchAllByStatus(status) {
      const all = [];
      let offset = 0;
      const pageSize = 100;
      while (true) {
        const page = await sevdeskGet(
          `/Invoice?limit=${pageSize}&offset=${offset}&embed=contact&status=${status}`,
        apiKey);
        const items = page.objects || [];
        all.push(...items);
        if (items.length < pageSize) break;
        offset += pageSize;
      }
      return all;
    }

    const [raw200, raw750] = await Promise.all([fetchAllByStatus(200), fetchAllByStatus(750)]);
    const allRaw = [...raw200, ...raw750];

    // 2. Nur echte, positive, offene Rechnungen — KEINE Gutschriften (GS)
    //    und KEINE Mahnungen (MA), sonst würden Mahnungen gemahnt.
    const candidates = allRaw.filter(inv => {
      if (inv.invoiceType === 'GS' || inv.invoiceType === 'MA') return false;
      if (parseAmount(inv.sumGross) <= 0) return false;
      return true;
    });

    // 3. Bestehende Mahnvorgänge laden — Deduplizierung pro (Rechnung, Stufe)
    const existingRecords = await base44.asServiceRole.entities.DunningRecord.list(null, 2000);

    // 3a. Rückabgleich: offene Entwürfe zu Rechnungen, die in sevDesk nicht mehr offen sind, schließen
    const openInvoiceIds = new Set(allRaw.map(i => String(i.id)));
    const stale = existingRecords.filter(
      r => r.status === 'draft_created' && r.sevdesk_invoice_id && !openInvoiceIds.has(String(r.sevdesk_invoice_id))
    );
    let closed = 0;
    if (!dryRun && stale.length > 0) {
      await base44.asServiceRole.entities.DunningRecord.bulkUpdate(
        stale.map(r => ({
          id: r.id,
          status: 'closed_paid',
          notes: [r.notes, `Automatisch geschlossen am ${today0Iso()} — Rechnung in sevDesk nicht mehr offen.`]
            .filter(Boolean).join(' ').slice(0, 1000),
        }))
      );
      closed = stale.length;
    } else if (dryRun) {
      closed = stale.length;
    }
    const maxLevelByInvoice = {};
    for (const r of existingRecords) {
      const key = r.sevdesk_invoice_id;
      if (!key) continue;
      maxLevelByInvoice[key] = Math.max(maxLevelByInvoice[key] || 0, r.dunning_level || 0);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let created = 0;
    let skipped = 0;
    let errorsCount = 0;
    const results = [];
    const errors = [];

    for (const inv of candidates) {
      const sevdeskId = String(inv.id);

      // Offener Betrag prüfen
      const grossAmount = parseAmount(inv.sumGross);
      const openAmount = parseAmount(inv.sumOpenAmount) > 0
        ? parseAmount(inv.sumOpenAmount)
        : Math.max(0, grossAmount - parseAmount(inv.paidAmount));
      if (openAmount <= 0) { skipped++; continue; }

      // Erstversanddatum: sendDate, Fallback invoiceDate
      const refDateStr = (inv.sendDate || inv.invoiceDate || '').substring(0, 10);
      if (!refDateStr) { skipped++; continue; }
      const refDate = new Date(refDateStr);
      refDate.setHours(0, 0, 0, 0);
      const daysSince = Math.floor((today.getTime() - refDate.getTime()) / 86400000);

      // Höchste anwendbare Stufe ermitteln
      let target = null;
      for (const l of LEVELS) {
        if (daysSince >= l.minDays) target = l;
      }
      if (!target) { skipped++; continue; }

      // Nur erstellen wenn diese Stufe noch nicht existiert
      const existingMax = maxLevelByInvoice[sevdeskId] || 0;
      if (target.level <= existingMax) { skipped++; continue; }

      const recordBase = {
        sevdesk_invoice_id: sevdeskId,
        invoice_number: inv.invoiceNumber || '',
        customer_name: inv.contact?.name || inv.contactName || '',
        gross_amount: grossAmount,
        open_amount: Math.round(openAmount * 100) / 100,
        reference_date: refDateStr,
        overdue_days_at_creation: daysSince,
        dunning_level: target.level,
        level_label: target.label,
        call_escalation: target.level >= 2,
      };

      if (dryRun) {
        results.push({ ...recordBase, dry_run: true });
        continue;
      }

      try {
        // 4. Mahnungs-Entwurf in sevDesk erstellen (Factory)
        const reminderResult = await sevdeskPost('/Invoice/Factory/createInvoiceReminder', apiKey, {
          invoice: { id: sevdeskId, objectName: 'Invoice' }
        });
        const reminder = reminderResult?.objects || reminderResult?.object || null;
        const reminderId = reminder?.id ? String(reminder.id) : null;
        if (!reminderId) throw new Error('sevDesk lieferte keine Mahnungs-ID zurück');

        // Kopfzeile der Mahnung auf die exakte Stufe setzen
        await sevdeskPut(`/Invoice/${reminderId}`, apiKey, {
          header: `${target.label} zu Rechnung ${inv.invoiceNumber || sevdeskId}`
        }).catch(() => null); // Header-Update ist kosmetisch — Entwurf existiert bereits

        await base44.asServiceRole.entities.DunningRecord.create({
          ...recordBase,
          sevdesk_reminder_id: reminderId,
          sevdesk_reminder_url: `https://my.sevdesk.de/fi/edit/type/MA/id/${reminderId}`,
          status: 'draft_created',
        });
        created++;
        results.push({ ...recordBase, sevdesk_reminder_id: reminderId });
        maxLevelByInvoice[sevdeskId] = target.level;
      } catch (e) {
        errorsCount++;
        errors.push(`${inv.invoiceNumber || sevdeskId}: ${e.message}`);
        await base44.asServiceRole.entities.DunningRecord.create({
          ...recordBase,
          status: 'error',
          error_message: e.message.slice(0, 500),
        }).catch(() => null);
        if (e.message?.includes('429')) await sleep(5000);
      }

      await sleep(800);
    }

    if (!dryRun) {
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'create',
        entity_type: 'dunning_run',
        entity_id: 'daily_check',
        user_email: user?.email || 'system',
        details: `Mahnlauf: ${candidates.length} geprüft, ${created} Mahnentwürfe erstellt, ${closed} bezahlte Entwürfe geschlossen, ${skipped} übersprungen, ${errorsCount} Fehler`
      }).catch(() => null);
    }

    return Response.json({
      success: true,
      dry_run: dryRun,
      checked: candidates.length,
      created: dryRun ? results.length : created,
      closed,
      skipped,
      errors_count: errorsCount,
      errors: errors.slice(0, 10),
      results: results.slice(0, 50),
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});