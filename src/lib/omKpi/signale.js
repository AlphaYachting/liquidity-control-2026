// Ampelregeln der OM-Kennzahlen — EINE Stelle, damit Seite und späterer Wächter gleich urteilen.
// Eingang: ein OmKpiTag (Zahlen des Stichtags) und das zugehörige OmKundenKonto (Zuordnung, Budget, Ziel-CPA).
// Ausgang: { ton, signale: [{ ton, text }] } — ton ist einer der fünf Statustöne der App.

const RANG = { critical: 3, attention: 2, neutral: 1, done: 0 };

const prozent = (wert, schnitt) => Math.round((wert / schnitt - 1) * 100);
const eur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
const tagMonat = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : '');

function adsSignale(ads, konto, stichtag) {
  const s = [];
  if (!ads) return s;

  if (ads.kosten === 0 && ads.kosten_7t_schnitt > 0) {
    s.push({ ton: 'critical', text: `Keine Ausspielung gestern (sonst Ø ${eur(ads.kosten_7t_schnitt)} am Tag)` });
  }
  if (ads.tage_ohne_conversion >= 7) {
    s.push({ ton: 'critical', text: `Seit ${ads.tage_ohne_conversion} Tagen keine Ads-Conversion` });
  } else if (ads.tage_ohne_conversion >= 4) {
    s.push({ ton: 'attention', text: `Seit ${ads.tage_ohne_conversion} Tagen keine Ads-Conversion` });
  }
  if (ads.kosten > 0 && ads.kosten_7t_schnitt > 0) {
    if (ads.kosten > ads.kosten_7t_schnitt * 1.5) {
      s.push({ ton: 'attention', text: `Ads-Kosten ${prozent(ads.kosten, ads.kosten_7t_schnitt)} % über dem 7-Tage-Schnitt` });
    } else if (ads.kosten < ads.kosten_7t_schnitt * 0.5) {
      s.push({ ton: 'attention', text: `Ads-Kosten ${prozent(ads.kosten, ads.kosten_7t_schnitt)} % unter dem 7-Tage-Schnitt` });
    }
  }
  if (ads.klicks_7t_schnitt >= 10 && ads.klicks < ads.klicks_7t_schnitt * 0.6) {
    s.push({ ton: 'attention', text: `Ads-Klicks ${prozent(ads.klicks, ads.klicks_7t_schnitt)} % gegenüber dem 7-Tage-Schnitt` });
  }
  if (ads.conversions_7t_schnitt >= 2 && ads.conversions < ads.conversions_7t_schnitt * 0.5) {
    s.push({ ton: 'attention', text: `Ads-Conversions ${prozent(ads.conversions, ads.conversions_7t_schnitt)} % gegenüber dem 7-Tage-Schnitt` });
  }
  if (konto?.ziel_cpa && ads.cpa && ads.cpa > konto.ziel_cpa * 1.5) {
    s.push({ ton: 'attention', text: `CPA ${eur(ads.cpa)} — Ziel ${eur(konto.ziel_cpa)}` });
  }
  if (konto?.monatsbudget_ads && stichtag) {
    const d = new Date(`${stichtag}T12:00:00`);
    const tag = d.getDate();
    const tageImMonat = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    const hochrechnung = (ads.kosten_monat / tag) * tageImMonat;
    const anteil = hochrechnung / konto.monatsbudget_ads;
    if (anteil > 1.1) {
      s.push({ ton: 'attention', text: `Budget wird überschritten: Hochrechnung ${eur(hochrechnung)} von ${eur(konto.monatsbudget_ads)}` });
    } else if (anteil < 0.8) {
      s.push({ ton: 'attention', text: `Budget wird nicht ausgeschöpft: Hochrechnung ${eur(hochrechnung)} von ${eur(konto.monatsbudget_ads)}` });
    }
  }
  return s;
}

function ga4Signale(ga4, ads) {
  const s = [];
  if (!ga4) return s;

  if (ga4.sitzungen === 0 && ga4.sitzungen_7t_schnitt > 5) {
    s.push({ ton: 'critical', text: 'GA4 meldet keine Sitzungen — Tracking prüfen' });
    return s;
  }
  if (ga4.key_events === 0 && ga4.key_events_7t_schnitt === 0 && ga4.sitzungen > 0 && ads?.conversions_monat > 0) {
    s.push({ ton: 'attention', text: 'GA4 zählt keine Key Events, Google Ads schon — Conversion-Tracking prüfen' });
  } else if (ga4.key_events === 0 && ga4.key_events_7t_schnitt >= 1) {
    s.push({ ton: 'attention', text: `Keine Key Events gestern (sonst Ø ${ga4.key_events_7t_schnitt})` });
  }
  if (ga4.sitzungen_7t_schnitt >= 20 && ga4.sitzungen < ga4.sitzungen_7t_schnitt * 0.6) {
    s.push({ ton: 'attention', text: `Sitzungen ${prozent(ga4.sitzungen, ga4.sitzungen_7t_schnitt)} % gegenüber dem 7-Tage-Schnitt` });
  }
  return s;
}

function gscSignale(gsc) {
  const s = [];
  if (!gsc) return s;

  if (gsc.klicks_7t_schnitt >= 5 && gsc.klicks < gsc.klicks_7t_schnitt * 0.5) {
    s.push({ ton: 'attention', text: `Organische Klicks ${prozent(gsc.klicks, gsc.klicks_7t_schnitt)} % am ${tagMonat(gsc.datum)} (Search Console)` });
  }
  if (gsc.position_7t_schnitt && gsc.position - gsc.position_7t_schnitt > 3) {
    s.push({ ton: 'attention', text: `Ø-Position ${gsc.position.toLocaleString('de-AT')} statt ${gsc.position_7t_schnitt.toLocaleString('de-AT')} (Search Console)` });
  }
  return s;
}

export function bewerteKunde(tag, konto) {
  const signale = [];

  (tag?.quellen_fehler || []).forEach((q) => signale.push({ ton: 'critical', text: `${q} hat beim Abruf nicht geantwortet` }));
  signale.push(...adsSignale(tag?.ads, konto, tag?.stichtag));
  signale.push(...ga4Signale(tag?.ga4, tag?.ads));
  signale.push(...gscSignale(tag?.gsc));

  const hatDaten = !!(tag?.ads || tag?.ga4 || tag?.gsc);
  if (!hatDaten) signale.push({ ton: 'neutral', text: 'Keine Datenquelle zugeordnet' });
  if (konto?.zuordnung_pruefen && hatDaten) signale.push({ ton: 'neutral', text: `Zuordnung prüfen${konto.notiz ? `: ${konto.notiz}` : ''}` });

  const schlimmster = signale.reduce((max, x) => (RANG[x.ton] > RANG[max] ? x.ton : max), 'done');
  const ton = schlimmster === 'neutral' && hatDaten ? 'done' : schlimmster;
  signale.sort((a, b) => RANG[b.ton] - RANG[a.ton]);
  return { ton, signale, hatDaten };
}

export const TON_LABEL = {
  critical: 'Handeln',
  attention: 'Beobachten',
  done: 'Unauffällig',
  neutral: 'Keine Daten',
};

export const TON_RANG = RANG;
