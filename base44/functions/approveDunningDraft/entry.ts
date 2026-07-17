import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

async function sevdeskGet(path, apiKey) {
  const res = await fetch(`${SEVDESK_BASE}${path}`, {
    headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' }
  });
  if (!res.ok) throw new Error(`sevDesk GET ${path} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ error: 'SEVDESK_API_KEY not set' }, { status: 500 });

    const { dunning_record_id } = await req.json();
    if (!dunning_record_id) return Response.json({ error: 'dunning_record_id required' }, { status: 400 });

    const records = await base44.asServiceRole.entities.DunningRecord.filter({ id: dunning_record_id });
    const record = records?.[0];
    if (!record) return Response.json({ error: 'DunningRecord not found' }, { status: 404 });
    if (record.status !== 'draft_created') {
      return Response.json({ error: `Nur wartende Entwürfe können versendet werden (Status: ${record.status})` }, { status: 422 });
    }
    if (!record.sevdesk_reminder_id) {
      return Response.json({ error: 'Kein sevDesk-Entwurf verknüpft' }, { status: 422 });
    }

    const reminderId = record.sevdesk_reminder_id;

    // 1. Mahnung + Kontakt laden
    const invData = await sevdeskGet(`/Invoice/${reminderId}?embed=contact`, apiKey);
    const reminder = invData.objects?.[0];
    if (!reminder) return Response.json({ error: 'Mahnungs-Entwurf in sevDesk nicht gefunden' }, { status: 404 });

    const contactId = reminder.contact?.id;
    if (!contactId) return Response.json({ error: 'Kein Kontakt an der Mahnung hinterlegt' }, { status: 422 });

    // 2. E-Mail-Adresse des Kunden ermitteln (CommunicationWay, Typ EMAIL)
    const cwData = await sevdeskGet(
      `/CommunicationWay?contact[id]=${contactId}&contact[objectName]=Contact&type=EMAIL`,
      apiKey
    );
    const emails = cwData.objects || [];
    const mainEmail = emails.find(e => e.main === '1' || e.main === true) || emails[0];
    if (!mainEmail?.value) {
      return Response.json({ error: `Keine E-Mail-Adresse für "${record.customer_name}" in sevDesk hinterlegt. Bitte in sevDesk ergänzen oder manuell versenden.` }, { status: 422 });
    }
    const toEmail = mainEmail.value;

    // 3. PDF rendern (erforderlich vor dem Versand), ohne Status zu verändern
    await sevdeskGet(`/Invoice/${reminderId}/getPdf?preventSendBy=true`, apiKey);

    // 4. Per E-Mail versenden — sevDesk setzt die Mahnung damit auf "versendet"
    const subject = `${record.level_label} zu Rechnung ${record.invoice_number}`;
    const text = `Sehr geehrte Damen und Herren,\n\n` +
      `anbei erhalten Sie unsere ${record.level_label} zur Rechnung ${record.invoice_number} ` +
      `mit einem offenen Betrag von ${(record.open_amount || 0).toFixed(2).replace('.', ',')} EUR.\n\n` +
      `Wir bitten um zeitnahe Begleichung des offenen Betrags.\n\n` +
      `Mit freundlichen Grüßen\nRittler & Co`;

    const sendRes = await fetch(`${SEVDESK_BASE}/Invoice/${reminderId}/sendViaEmail`, {
      method: 'POST',
      headers: { 'Authorization': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ toEmail, subject, text })
    });
    if (!sendRes.ok) {
      const errText = (await sendRes.text()).slice(0, 300);
      return Response.json({ error: `Versand fehlgeschlagen (${sendRes.status}): ${errText}` }, { status: 502 });
    }

    await base44.asServiceRole.entities.DunningRecord.update(record.id, {
      status: 'approved',
      approved_by: user.email || '',
      approved_at: new Date().toISOString(),
      notes: `Per E-Mail versendet an ${toEmail}.`,
    });

    return Response.json({ success: true, sent_to: toEmail });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});