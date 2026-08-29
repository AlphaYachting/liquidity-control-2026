// Erkennt Stille nach einer Angebotsübermittlung — ohne neue Entity, ohne Hintergrundlauf.
// Liefert null oder { tage, gesendet_am, titel, summe }.
const STAGES = ['proposal_sent', 'negotiation', 'estimated'];

const istAngebotsmail = (a) =>
  a.channel === 'email' && a.direction === 'ausgehend' && a.intent === 'angebot';

// Rückfallebene für Altdaten: vor dem Feld intent trug nur der Titel die Absicht.
const istAltAngebotsmail = (a) =>
  a.activity_type === 'email' && String(a.title || '').startsWith('Angebots-E-Mail');

export function angebotStille(deal, activities = [], appointments = []) {
  if (!deal || !STAGES.includes(deal.stage)) return null;

  const kandidaten = (activities || []).filter((a) => istAngebotsmail(a) || istAltAngebotsmail(a));
  if (kandidaten.length === 0) return null;

  const gesendet = kandidaten
    .map((a) => ({ a, t: new Date(a.activity_date || a.created_date).getTime() }))
    .sort((x, y) => y.t - x.t)[0];
  if (!gesendet?.t) return null;

  const tage = Math.floor((Date.now() - gesendet.t) / 86400000);
  if (tage < 7) return null;

  const eingehendDanach = (activities || []).some(
    (a) => a.direction === 'eingehend' && new Date(a.activity_date || a.created_date).getTime() > gesendet.t,
  );
  if (eingehendDanach) return null;

  const bestaetigt = (appointments || []).some((t) => t.status === 'confirmed');
  if (bestaetigt) return null;

  return {
    tage,
    gesendet_am: gesendet.a.activity_date || gesendet.a.created_date,
    titel: String(gesendet.a.title || '').replace(/^.*?— /, ''),
    summe: deal.value_net || 0,
  };
}