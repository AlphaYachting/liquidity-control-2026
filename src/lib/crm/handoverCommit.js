import { base44 } from '@/api/base44Client';

// Legt aus dem Übergabeblatt den Auftrag samt Positionen an und baut den
// Startkeim für den Anlage-Wizard. Wird ausschließlich bei „Freigeben & anlegen" gerufen.

const norm = (s) => (s || '').toLowerCase().replace(/[^a-zäöüß0-9]/g, '');

// Namensvorschlag für die Modulwahl im Übergabeblatt — nur Vorschlag, keine Entscheidung
export function suggestModuleId(name, modules) {
  const key = norm(name);
  if (!key) return '';
  const mod = modules.find((m) => norm(m.name) === key)
    || modules.find((m) => norm(m.name).includes(key) || key.includes(norm(m.name)));
  return mod ? mod.id : '';
}

// Nur ausdrücklich gewählte Module gehen in den Wizard. Positionen, für die
// bewusst „ohne Modul / nach Aufwand" gewählt wurde, tragen keine Modul-ID —
// nichts fällt unbemerkt weg, weil die Wahl im Übergabeblatt erzwungen wird.
export function matchModules(positions, modules) {
  return positions.map((p, i) => {
    const mod = modules.find((m) => m.id === p.module_template_id);
    if (!mod) return null;
    return { key: `${mod.id}-${i}`, module_template_id: mod.id, name: p.name || mod.name, amount: p.amount || mod.standard_price || '', addon_ids: [] };
  }).filter(Boolean);
}

// Der Kunde wird im Übergabeblatt ausdrücklich gewählt oder angelegt —
// hier wird nie mehr geraten und kein Stummel-Client erzeugt.
export async function commitHandover({ deal, kunde, clientId, sevdeskContactId, positions, total, advancePercent, projectType, pm, abRequired, modules, contextText }) {
  if (!clientId) throw new Error('Kein verknüpfter Kunde übergeben');
  const today = new Date().toISOString().split('T')[0];

  const order = await base44.entities.ConfirmedOrder.create({
    customer: kunde || deal.title,
    project_name: deal.title,
    deal_id: deal.id,
    proposal_id: deal.proposal_id || '',
    advance_percent: Number(advancePercent) || 0,
    total_net_amount: total,
    confirmation_date: today,
    status: 'confirmed',
    source_type: 'manual',
    responsible_project_manager: pm,
    sevdesk_contact_id: sevdeskContactId || '',
    notes: `Projekttyp: ${projectType}`,
  });

  if (positions.length > 0) {
    await base44.entities.ConfirmedOrderItem.bulkCreate(positions.map((p, i) => ({
      confirmed_order_id: order.id,
      position: i + 1,
      title: p.name,
      unit_price: p.amount,
      quantity: 1,
      total_price: p.amount,
    })));
  }

  // Beleg in sevDesk: Angebot anlegen, daraus die Auftragsbestätigung erzeugen
  let sevdeskFehler = '';
  const belegPositionen = positions.length > 0
    ? positions.map((p) => ({ name: p.name, amount: p.amount, quantity: 1 }))
    : [{ name: deal.title, amount: total, quantity: 1 }];
  const res = await base44.functions.invoke('createSevdeskAngebotUndAb', {
    sevdesk_contact_id: sevdeskContactId,
    header: `Angebot ${deal.title}`,
    positions: belegPositionen,
  }).catch((e) => ({ data: { success: false, error: e?.message || 'sevDesk nicht erreichbar' } }));
  const beleg = res?.data || {};
  if (beleg.success) {
    await base44.entities.ConfirmedOrder.update(order.id, {
      sevdesk_quote_id: beleg.quote_id || '',
      sevdesk_quote_number: beleg.quote_number || '',
      sevdesk_order_id: beleg.order_id || '',
      sevdesk_order_url: beleg.order_url || '',
      order_number: beleg.order_number || '',
    });
  } else {
    sevdeskFehler = beleg.error || 'Angebot/Auftragsbestätigung konnte in sevDesk nicht angelegt werden';
    if (beleg.quote_id) {
      await base44.entities.ConfirmedOrder.update(order.id, {
        sevdesk_quote_id: beleg.quote_id,
        sevdesk_quote_number: beleg.quote_number || '',
      });
    }
  }

  return {
    order,
    sevdeskFehler,
    wizardState: {
      seed: {
        client_id: clientId,
        type: projectType === 'paket' ? 'sprint' : projectType,
        pm_email: pm,
        title: deal.title,
      },
      sprint: { selected: matchModules(positions, modules) },
      handoff: {
        confirmed_order_id: order.id,
        deal_id: deal.id,
        customer: kunde,
        project_name: deal.title,
        total_net: total,
        advance_percent: Number(advancePercent) || 0,
        ab_required: abRequired,
        pm,
        context_text: contextText || '',
        email_thread_id: deal.email_thread_id || '',
      },
    },
  };
}