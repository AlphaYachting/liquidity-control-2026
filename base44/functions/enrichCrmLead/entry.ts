import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const FREEMAIL = [
  'gmail.com', 'googlemail.com', 'gmx.at', 'gmx.net', 'gmx.de', 'outlook.com', 'outlook.de',
  'hotmail.com', 'hotmail.de', 'yahoo.com', 'yahoo.de', 'icloud.com', 'web.de', 't-online.de',
  'aon.at', 'live.com', 'live.at', 'me.com', 'protonmail.com', 'proton.me', 'chello.at', 'a1.net'
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const isAuth = await base44.auth.isAuthenticated();
    if (!isAuth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await req.json().catch(() => ({}));
    const dealId = payload.deal_id || payload.event?.entity_id;
    if (!dealId) return Response.json({ error: 'deal_id fehlt' }, { status: 400 });

    const db = base44.asServiceRole.entities;
    const deal = await db.CrmDeal.get(dealId);
    if (!deal) return Response.json({ error: 'Deal nicht gefunden' }, { status: 404 });

    // Fehlende Stammdaten ermitteln
    const missing = [];
    if (!deal.company_name) missing.push('Firmenname');
    if (!deal.contact_name) missing.push('Ansprechpartner');
    if (!deal.contact_phone) missing.push('Telefon');
    if (!deal.company_website) missing.push('Website');
    if (!deal.company_address) missing.push('Adresse');

    if (missing.length === 0) {
      await db.CrmDeal.update(dealId, { enrichment_status: 'complete', enriched_at: new Date().toISOString() });
      return Response.json({ status: 'complete', message: 'Alle Stammdaten vorhanden' });
    }

    // Recherche-Ansatz: Firmen-Domain aus E-Mail (keine Freemail) oder vorhandener Firmenname
    let domain = null;
    if (deal.contact_email && deal.contact_email.includes('@')) {
      const d = deal.contact_email.split('@')[1].toLowerCase().trim();
      if (!FREEMAIL.includes(d)) domain = d;
    }

    if (!domain && !deal.company_name) {
      await db.CrmDeal.update(dealId, {
        enrichment_status: 'insufficient_data',
        enrichment_summary: 'Keine Firmen-Domain (private E-Mail-Adresse) und kein Firmenname vorhanden — Stammdaten bitte manuell ergänzen.',
        enriched_at: new Date().toISOString(),
      });
      await db.CrmActivity.create({
        deal_id: dealId,
        activity_type: 'system',
        title: 'Stammdaten-Prüfung: Recherche nicht möglich',
        content: `Fehlend: ${missing.join(', ')}. Absender nutzt eine private E-Mail-Adresse und es liegt kein Firmenname vor — bitte Stammdaten manuell erfassen.`,
        activity_date: new Date().toISOString(),
      });
      return Response.json({ status: 'insufficient_data', missing });
    }

    const seed = domain
      ? `E-Mail-Domain des Absenders: ${domain} (Website vermutlich https://${domain})`
      : `Firmenname: ${deal.company_name}`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Du bist ein Recherche-Assistent für eine österreichische Digitalagentur. Ein neuer Lead ist eingegangen und es fehlen Unternehmens-Stammdaten. Recherchiere das Unternehmen im Internet.

Bekannte Daten zum Lead:
- ${seed}
- Absendername: ${deal.contact_name || 'unbekannt'}
- Absender-E-Mail: ${deal.contact_email || 'unbekannt'}
- Bisheriger Firmenname: ${deal.company_name || 'unbekannt'}
- Anfrage-Betreff: ${deal.title || '—'}
- Anfrage-Inhalt: ${(deal.description || '').slice(0, 1000) || '—'}

Finde heraus (nur belegbare Fakten, keine Vermutungen):
1. Offizieller Firmenname
2. Website-URL
3. Firmenadresse (Straße, PLZ, Ort, Land)
4. Branche/Tätigkeitsfeld
5. Firmengröße (Mitarbeiteranzahl, falls auffindbar)
6. Zentrale Telefonnummer
7. Kurze Zusammenfassung (2-3 Sätze) über das Unternehmen

Wenn du das Unternehmen nicht eindeutig identifizieren kannst, setze found=false.`,
      add_context_from_internet: true,
      response_json_schema: {
        type: 'object',
        properties: {
          found: { type: 'boolean' },
          company_name: { type: 'string' },
          website: { type: 'string' },
          address: { type: 'string' },
          industry: { type: 'string' },
          company_size: { type: 'string' },
          phone: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['found'],
      },
    });

    if (!result.found) {
      await db.CrmDeal.update(dealId, {
        enrichment_status: 'insufficient_data',
        enrichment_summary: `Unternehmen konnte im Netz nicht eindeutig identifiziert werden (Basis: ${domain || deal.company_name}).`,
        enriched_at: new Date().toISOString(),
      });
      await db.CrmActivity.create({
        deal_id: dealId,
        activity_type: 'system',
        title: 'Stammdaten-Recherche ohne Ergebnis',
        content: `Fehlend: ${missing.join(', ')}. Web-Recherche über ${domain || deal.company_name} lieferte kein eindeutiges Ergebnis — bitte manuell prüfen.`,
        activity_date: new Date().toISOString(),
      });
      return Response.json({ status: 'insufficient_data', missing });
    }

    // Nur leere Felder befüllen — vorhandene Angaben des Absenders nie überschreiben
    const updates = {
      enrichment_status: 'enriched',
      enrichment_summary: result.summary || '',
      enriched_at: new Date().toISOString(),
    };
    const filled = [];
    if (!deal.company_name && result.company_name) { updates.company_name = result.company_name; filled.push(`Firma: ${result.company_name}`); }
    if (!deal.company_website && result.website) { updates.company_website = result.website; filled.push(`Website: ${result.website}`); }
    if (!deal.company_address && result.address) { updates.company_address = result.address; filled.push(`Adresse: ${result.address}`); }
    if (!deal.company_industry && result.industry) { updates.company_industry = result.industry; filled.push(`Branche: ${result.industry}`); }
    if (!deal.company_size && result.company_size) { updates.company_size = result.company_size; filled.push(`Größe: ${result.company_size}`); }
    if (!deal.contact_phone && result.phone) { updates.contact_phone = result.phone; filled.push(`Telefon: ${result.phone}`); }

    await db.CrmDeal.update(dealId, updates);

    const stillMissing = missing.filter(m =>
      (m === 'Firmenname' && !updates.company_name && !deal.company_name) ||
      (m === 'Ansprechpartner' && !deal.contact_name) ||
      (m === 'Telefon' && !updates.contact_phone && !deal.contact_phone) ||
      (m === 'Website' && !updates.company_website && !deal.company_website) ||
      (m === 'Adresse' && !updates.company_address && !deal.company_address)
    );

    await db.CrmActivity.create({
      deal_id: dealId,
      activity_type: 'system',
      title: 'Stammdaten automatisch recherchiert',
      content: [
        filled.length > 0 ? `Ergänzt aus Web-Recherche:\n${filled.map(f => `• ${f}`).join('\n')}` : 'Keine neuen Daten gefunden.',
        result.summary ? `\nÜber das Unternehmen: ${result.summary}` : '',
        stillMissing.length > 0 ? `\nWeiterhin fehlend: ${stillMissing.join(', ')}` : '',
      ].join('\n').trim(),
      activity_date: new Date().toISOString(),
    });

    return Response.json({ status: 'enriched', filled, still_missing: stillMissing });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});