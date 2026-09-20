import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const SEVDESK_BASE = 'https://my.sevdesk.de/api/v1';

// Ausgangsrichtung: Kunde der App in sevDesk anlegen, Kontakt-ID zurückgeben.
// Mitgeschrieben werden Rechnungsadresse, E-Mail, Telefon und der Ansprechpartner
// als eigener Kontakt unter der Firma. Jeder Teilschritt, der scheitert, wird
// benannt (warnings) — es entsteht nie ein stiller Stummel.
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    if (!name) return Response.json({ error: 'name fehlt' }, { status: 400 });

    const apiKey = Deno.env.get('SEVDESK_API_KEY');
    if (!apiKey) {
      return Response.json({ success: false, needs_manual: true, error: 'SEVDESK_API_KEY nicht gesetzt' });
    }
    const headers = { Authorization: apiKey, 'Content-Type': 'application/json' };
    const warnings: string[] = [];

    const post = async (pfad: string, nutzlast: unknown) => {
      const res = await fetch(`${SEVDESK_BASE}/${pfad}`, { method: 'POST', headers, body: JSON.stringify(nutzlast) });
      const text = await res.text();
      if (!res.ok) throw new Error(`${pfad} ${res.status}: ${text.slice(0, 200)}`);
      return JSON.parse(text)?.objects;
    };

    // 1) Firma
    const created = await post('Contact', { name, category: { id: 3, objectName: 'Category' } });
    const contactId = String(created?.id || '');
    if (!contactId) {
      return Response.json({ success: false, needs_manual: true, error: 'sevDesk hat keine Kontakt-ID geliefert' });
    }

    // 2) Rechnungsadresse der Firma
    const street = String(body.street || '').trim();
    const city = String(body.city || '').trim();
    const zip = String(body.zip || '').trim();
    let addressWarning = '';
    if (street && city) {
      const code = String(body.country_code || 'AT').trim().toUpperCase();
      const landRes = await fetch(`${SEVDESK_BASE}/StaticCountry?code=${encodeURIComponent(code)}`, { headers }).catch(() => null);
      const landId = landRes && landRes.ok ? (await landRes.json())?.objects?.[0]?.id : null;
      try {
        await post('ContactAddress', {
          contact: { id: contactId, objectName: 'Contact' },
          street,
          zip,
          city,
          ...(landId ? { country: { id: landId, objectName: 'StaticCountry' } } : {}),
          category: { id: 47, objectName: 'Category' },
        });
      } catch (e) {
        addressWarning = `Adresse konnte in sevDesk nicht gespeichert werden (${e.message})`;
        warnings.push(addressWarning);
      }
    } else {
      addressWarning = 'Keine vollständige Adresse übergeben — in sevDesk fehlt die Rechnungsadresse';
      warnings.push(addressWarning);
    }

    // 3) Kommunikationswege — an Firma und Ansprechpartner
    const email = String(body.contact_email || '').trim();
    const phone = String(body.contact_phone || '').trim();
    const wege = async (zielId: string, etikett: string) => {
      if (email && email !== 'unbekannt@example.com') {
        try {
          await post('CommunicationWay', {
            contact: { id: zielId, objectName: 'Contact' },
            type: 'EMAIL', value: email, key: { id: 1, objectName: 'CommunicationWayKey' },
          });
        } catch (e) { warnings.push(`E-Mail (${etikett}) nicht gespeichert: ${e.message}`); }
      }
      if (phone) {
        try {
          await post('CommunicationWay', {
            contact: { id: zielId, objectName: 'Contact' },
            type: 'PHONE', value: phone, key: { id: 1, objectName: 'CommunicationWayKey' },
          });
        } catch (e) { warnings.push(`Telefon (${etikett}) nicht gespeichert: ${e.message}`); }
      }
    };
    await wege(contactId, 'Firma');

    // 4) Ansprechpartner: die Person, die den Lead geschrieben hat
    const person = String(body.contact_person || '').trim();
    let personId = '';
    if (person) {
      const teile = person.split(/\s+/);
      const familyname = teile.length > 1 ? teile.slice(1).join(' ') : person;
      const surename = teile.length > 1 ? teile[0] : '';
      try {
        const angelegt = await post('Contact', {
          surename,
          familyname,
          parent: { id: contactId, objectName: 'Contact' },
          category: { id: 3, objectName: 'Category' },
        });
        personId = String(angelegt?.id || '');
        if (personId) await wege(personId, 'Ansprechpartner');
      } catch (e) {
        warnings.push(`Ansprechpartner „${person}" nicht angelegt: ${e.message}`);
      }
    }

    return Response.json({
      success: true,
      sevdesk_contact_id: contactId,
      sevdesk_person_id: personId,
      name: created?.name || name,
      address_warning: addressWarning,
      warnings,
    });
  } catch (error) {
    return Response.json({ success: false, needs_manual: true, error: error.message });
  }
}