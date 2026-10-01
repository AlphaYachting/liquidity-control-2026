// Lädt die Gestaltungsdaten eines Studio-Angebots: config_json, sonst die Datei aus config_json_url.
// Die Datei ist teils als { response: "<json>" } verpackt und enthält gelegentlich ein
// ASCII-Anführungszeichen als schließendes deutsches Zeichen („…") — das wird repariert.

function parse(text) {
  if (!text) return null;
  if (typeof text === 'object') return text;
  try { return JSON.parse(text); } catch { /* weiter mit Reparatur */ }
  try { return JSON.parse(String(text).replace(/„([^"“\n]*)"/g, '„$1“')); } catch { return null; }
}

function auspacken(o) {
  let x = o;
  if (x && typeof x.response === 'string') x = parse(x.response);
  return x?.config || x || null;
}

export async function ladeStudioConfig(proposal) {
  if (!proposal) return null;
  const direkt = auspacken(parse(proposal.config_json));
  if (direkt && Object.keys(direkt).length) return direkt;
  if (!proposal.config_json_url) return null;
  const res = await fetch(proposal.config_json_url).catch(() => null);
  if (!res?.ok) return null;
  return auspacken(parse(await res.text()));
}