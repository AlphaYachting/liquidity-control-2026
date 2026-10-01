import { proposalPositions, studioAuftrag, toAmount, deDatumZuIso } from '@/lib/crm/proposalPositions';

// Vereinheitlicht das angenommene Angebot zu Positionen + Auftragsrahmen.
// Rangfolge: Studio → E-Mail-Angebot → externes PDF → Handeingabe.

export const QUELLEN = {
  studio: 'Studio-Angebot',
  email_angebot: 'E-Mail-Angebot',
  extern_pdf: 'Externes Angebots-PDF',
  manuell: 'Handeingabe',
};

export const STANDARD_SCHLEIFEN = 3;
export const STANDARD_MEHRKOSTEN = 'Leistungen über den vereinbarten Umfang hinaus werden nach Aufwand verrechnet. Der Kunde wird vorab über Mehrkosten informiert.';

const ABRECHNUNG = (s) => (/monat/i.test(s || '') ? 'monatlich' : /aufwand/i.test(s || '') ? 'nach_aufwand' : 'einmalig');

const position = (p) => ({
  name: '', amount: 0, description: '', lieferumfang: [], korrekturschleifen: '',
  leistungszeitraum: '', abrechnung: 'einmalig', optional_im_angebot: false, ...p,
});

function externPositionen(json) {
  return (json?.positions || []).filter((p) => p?.name).map((p) => position({
    name: p.name,
    amount: Number(p.amount) || 0,
    description: p.description || '',
    lieferumfang: Array.isArray(p.lieferumfang) ? p.lieferumfang : [],
    korrekturschleifen: p.korrekturschleifen ?? '',
    leistungszeitraum: p.leistungszeitraum || '',
    abrechnung: ABRECHNUNG(p.abrechnung),
    optional_im_angebot: Boolean(p.optional),
  }));
}

export function externesAngebot(json, url) {
  return {
    quelle: 'extern_pdf',
    nummer: json?.offer_number || '',
    datum: deDatumZuIso(json?.offer_date) || (/^\d{4}-\d{2}-\d{2}/.test(json?.offer_date || '') ? json.offer_date.slice(0, 10) : ''),
    url: url || '',
    summe: Number(json?.total_net) || 0,
    altesSchema: !!json && json.schema_version !== 2,
    positionen: externPositionen(json),
    auftrag: {
      leistungszeitraum: json?.leistungszeitraum || '',
      liefertermin: deDatumZuIso(json?.liefertermin) || json?.liefertermin || '',
      korrekturschleifen: json?.korrekturschleifen ?? '',
      mehrkosten_regel: json?.mehrkosten_regel || '',
      nicht_enthalten: json?.nicht_enthalten || [],
      zahlungsbedingungen: json?.zahlungsbedingungen || '',
    },
  };
}

export function bestimmeAngebot({ deal, proposal, config, quote }) {
  const studio = proposal ? proposalPositions(proposal, config) : [];
  if (studio.length) {
    const a = studioAuftrag(config);
    return {
      quelle: 'studio', nummer: '', datum: a.angebot_datum || '', url: proposal.pdf_url || '', summe: a.summe || 0,
      positionen: studio,
      // mehrere Pakete zur Wahl → nichts vorauswählen
      keineVorauswahl: studio.filter((p) => /paket/i.test(p.name)).length > 1,
      auftrag: { leistungszeitraum: a.leistungszeitraum, liefertermin: a.liefertermin, korrekturschleifen: '', mehrkosten_regel: '', nicht_enthalten: a.nicht_enthalten },
    };
  }
  if (quote && (quote.items || []).length) {
    return {
      quelle: 'email_angebot',
      nummer: quote.sevdesk_quote_number || quote.quote_number || '',
      datum: (quote.sent_at || '').slice(0, 10),
      url: quote.sevdesk_quote_url || '',
      summe: Number(quote.total_net) || 0,
      positionen: quote.items.map((it) => position({
        name: it.title || 'Position',
        amount: toAmount(it.total_price),
        description: [it.description, Number(it.quantity) > 1 ? `${it.quantity} × ${it.unit || 'Stück'}` : ''].filter(Boolean).join('\n'),
      })),
      auftrag: { leistungszeitraum: '', liefertermin: '', korrekturschleifen: '', mehrkosten_regel: '', nicht_enthalten: quote.excluded || [] },
    };
  }
  if (deal.externes_angebot_json || deal.externes_angebot_url) {
    let json = null;
    try { json = JSON.parse(deal.externes_angebot_json || 'null'); } catch { json = null; }
    return externesAngebot(json, deal.externes_angebot_url);
  }
  return { quelle: 'manuell', nummer: '', datum: '', url: '', summe: 0, positionen: [], auftrag: {} };
}

// Bearbeitbarer Zustand: Haken setzen, Lücken mit Standardwerten füllen
export function startZustand(angebot) {
  const a = angebot.auftrag || {};
  const schleifenFehlt = a.korrekturschleifen === '' || a.korrekturschleifen == null;
  return {
    positionen: angebot.positionen.map((p) => ({ ...p, beauftragt: !angebot.keineVorauswahl && !p.optional_im_angebot })),
    auftrag: {
      leistungszeitraum: a.leistungszeitraum || '',
      liefertermin: a.liefertermin || '',
      korrekturschleifen: schleifenFehlt ? STANDARD_SCHLEIFEN : a.korrekturschleifen,
      schleifenStandard: schleifenFehlt,
      mehrkosten_regel: a.mehrkosten_regel || STANDARD_MEHRKOSTEN,
      nicht_enthalten: a.nicht_enthalten || [],
      zahlungsbedingungen: a.zahlungsbedingungen || '',
    },
  };
}