// Wartezeit-Anzeige eines Posteingangs-Eintrags (gleich für Anfrage- und Verlaufskarten).
const uhrzeit = (ms) => {
  const d = new Date(ms);
  const heute = new Date();
  const gleicherTag = d.toDateString() === heute.toDateString();
  return gleicherTag
    ? d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('de-AT', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
};

export function wartezeitText(eintrag, jetzt = Date.now()) {
  if (!eintrag.sichtbar) return { text: `zählt ab ${uhrzeit(eintrag.sichtbarAb)}`, ton: 'neutral' };
  const stunden = (jetzt - eintrag.eingang) / 3600000;
  if (stunden >= 48) return { text: `${Math.floor(stunden / 24)} Tage unbeantwortet`, ton: 'critical' };
  if (stunden >= 24) return { text: 'seit 1 Tag', ton: 'neutral' };
  return { text: `seit ${Math.max(1, Math.floor(stunden))} Std.`, ton: 'neutral' };
}
