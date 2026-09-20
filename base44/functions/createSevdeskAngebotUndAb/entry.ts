import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

// Beauftragung in sevDesk: erst ein Angebot (AN) mit allen Positionen anlegen,
// daraus die Auftragsbestätigung (AB) erzeugen. Gibt beide IDs und Nummern zurück.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const contactId = String(body.sevdesk_contact_id || '').trim();
    const positions = Array.isArray(body.positions) ? body.positions : [];
    if (!contactId) return Response.json({ success: false, error: 'sevdesk_contact_id fehlt' });
    if (positions.length === 0) return Response.json({ success: false, error: 'keine Positionen übergeben' });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) return Response.json({ success: false, error: 'SEVDESK_API_KEY nicht gesetzt' });
    const headers = { Authorization: apiKey, 'Content-Type': 'application/json' };

    const userRes = await fetch(`${SEVDESK_BASE}/SevUser?limit=1`, { headers });
    const sevUserId = (await userRes.json())?.objects?.[0]?.id;
    if (!sevUserId) return Response.json({ success: false, error: 'kein sevDesk-Benutzer gefunden' });

    const taxRate = Number(body.vat_rate ?? 20);
    const today = new Date().toISOString().split('T')[0];

    const angebotBody = {
      order: {
        objectName: 'Order',
        mapAll: true,
        orderNumber: '',
        contact: { id: contactId, objectName: 'Contact' },
        orderDate: today,
        status: 100,
        header: String(body.header || 'Angebot'),
        headText: String(body.head_text || ''),
        footText: String(body.foot_text || ''),
        orderType: 'AN',
        version: 0,
        smallSettlement: 0,
        contactPerson: { id: sevUserId, objectName: 'SevUser' },
        taxRate,
        taxText: `Umsatzsteuer ${taxRate}%`,
        taxType: 'default',
        currency: 'EUR',
      },
      orderPosSave: positions.map((p) => ({
        objectName: 'OrderPos',
        mapAll: true,
        part: null,
        quantity: Number(p.quantity) || 1,
        price: Number(p.amount) || 0,
        name: String(p.name || 'Leistung'),
        unity: { id: 1, objectName: 'Unity' },
        taxRate,
      })),
      orderPosDelete: null,
    };

    const angebotRes = await fetch(`${SEVDESK_BASE}/Order/Factory/saveOrder`, {
      method: 'POST', headers, body: JSON.stringify(angebotBody),
    });
    const angebotText = await angebotRes.text();
    if (!angebotRes.ok) {
      return Response.json({ success: false, error: `Angebot ${angebotRes.status}: ${angebotText.slice(0, 300)}` });
    }
    const angebot = JSON.parse(angebotText)?.objects?.order || JSON.parse(angebotText)?.objects;
    const quoteId = String(angebot?.id || '');
    if (!quoteId) return Response.json({ success: false, error: 'sevDesk hat keine Angebots-ID geliefert' });

    // Auftragsbestätigung aus dem Angebot
    const abRes = await fetch(`${SEVDESK_BASE}/Order/Factory/createContractNoteFromOrder`, {
      method: 'POST', headers,
      body: JSON.stringify({ order: { id: quoteId, objectName: 'Order' } }),
    });
    const abText = await abRes.text();
    if (!abRes.ok) {
      return Response.json({
        success: false,
        quote_id: quoteId,
        quote_number: angebot?.orderNumber || '',
        error: `Auftragsbestätigung ${abRes.status}: ${abText.slice(0, 300)}`,
      });
    }
    const ab = JSON.parse(abText)?.objects?.order || JSON.parse(abText)?.objects;
    const orderId = String(ab?.id || '');

    return Response.json({
      success: true,
      quote_id: quoteId,
      quote_number: angebot?.orderNumber || '',
      order_id: orderId,
      order_number: ab?.orderNumber || '',
      order_url: orderId ? `https://my.sevdesk.de/#/om/edit/type/AB/id/${orderId}` : '',
    });
  } catch (error) {
    return Response.json({ success: false, error: error.message });
  }
}