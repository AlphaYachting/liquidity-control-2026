// Erkennt, welches Projekt / welcher Kunde in einem Text (z.B. Gesprächstitel) genannt wird.
// Liefert das beste Match (längster Treffer gewinnt) oder null.
export function findProjectMatch(text, projects) {
  if (!text || !projects?.length) return null;
  const t = String(text).toLowerCase();
  let best = null;
  let bestLen = 0;

  for (const p of projects) {
    const candidates = [
      { value: p.customer, min: 4 },
      { value: p.project_name, min: 5 },
    ];
    for (const c of candidates) {
      const v = String(c.value || '').trim();
      if (v.length < c.min) continue;
      if (t.includes(v.toLowerCase()) && v.length > bestLen) {
        best = p;
        bestLen = v.length;
      }
    }
  }
  return best;
}