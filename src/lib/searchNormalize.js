// Dieselbe Normalisierung wie serverseitig (base44/shared/searchNormalize.js).
// Wird sie hier anders, findet der Browser nicht, was der Index enthält.
export function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function haystackVon(teile) {
  return normalize(teile.filter(Boolean).join(' '));
}