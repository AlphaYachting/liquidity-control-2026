// Zerlegt eine einzeilige Firmenadresse aus dem Deal in Straße / PLZ / Ort.
// Nur ein Vorschlag — im Übergabeblatt wird jedes Feld sichtbar bestätigt.
export function adresseAufteilen(text) {
  const roh = String(text || '').replace(/\n/g, ', ').trim();
  if (!roh) return { street: '', zip: '', city: '', country_code: 'AT' };
  const teile = roh.split(',').map((t) => t.trim()).filter(Boolean);
  const plzZeile = teile.find((t) => /^\d{4,5}\s+\S/.test(t)) || '';
  const treffer = plzZeile.match(/^(\d{4,5})\s+(.+)$/);
  return {
    street: teile.find((t) => t !== plzZeile) || '',
    zip: treffer ? treffer[1] : '',
    city: treffer ? treffer[2] : '',
    country_code: 'AT',
  };
}

export const adresseVollstaendig = (c) => Boolean(c?.street && c?.zip && c?.city);