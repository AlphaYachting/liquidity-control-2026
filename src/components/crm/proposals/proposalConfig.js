export const PROPOSAL_STATUSES = {
  input: { label: 'Input & Kontext', color: 'bg-slate-100 text-slate-600', step: 1 },
  analysis_review: { label: 'Analyse zur Freigabe', color: 'bg-amber-100 text-amber-700', step: 2 },
  mapping_review: { label: 'Mapping zur Freigabe', color: 'bg-blue-100 text-blue-700', step: 3 },
  config_ready: { label: 'Freigegeben — bereit zum Rendern', color: 'bg-violet-100 text-violet-700', step: 4 },
  rendering: { label: 'PDF wird erstellt…', color: 'bg-sky-100 text-sky-700', step: 4 },
  rendered: { label: 'PDF erstellt ✓', color: 'bg-emerald-100 text-emerald-600', step: 5 },
  error: { label: 'Fehler', color: 'bg-red-100 text-red-600', step: 0 },
};

export const MODE_LABELS = { full: 'Vollversion', short: 'Kurzform', email: 'E-Mail' };

// Drei Angebotstypen — mode ist das abgeleitete Feld für Skill- und Template-Auswahl.
export const OFFER_TYPES = {
  neukunde: { label: 'Neukunde', chip: 'bg-violet-100 text-violet-700', mode: 'full' },
  bestand: { label: 'Bestand', chip: 'bg-blue-100 text-blue-700', mode: 'short' },
  email: { label: 'E-Mail', chip: 'bg-amber-100 text-amber-700', mode: 'email' },
};

export const SIGNERS = ['Alfons Rittler', 'Sebastian Haslinger'];

export const WORKFLOW_STEPS = [
  { key: 'input', label: '1 · Input & Kontext' },
  { key: 'analysis_review', label: '2 · Analyse (Stopp 1)' },
  { key: 'mapping_review', label: '3 · Mapping (Stopp 2)' },
  // statuses: welche Angebots-Status auf diese Stufe fallen (Reihenfolge = Schrittnummer)
  { key: 'config_ready', label: '4 · Config', statuses: ['config_ready', 'rendering'] },
  { key: 'rendered', label: '5 · PDF' },
];

// Typ B (Bestand) hat keinen Analyse-Schritt — je Typ eine eigene Stufenfolge,
// keine leeren oder übersprungenen Stufen.
export const WORKFLOW_STEPS_BESTAND = [
  { key: 'input', label: '1 · Input & Kontext' },
  { key: 'mapping_review', label: '2 · Positionen & Preise (Stopp)' },
  { key: 'config_ready', label: '3 · Config', statuses: ['config_ready', 'rendering'] },
  { key: 'rendered', label: '4 · PDF' },
];

// Typ C (E-Mail) läuft in einem Zug: Input, dann der Freigabe-Stopp am Mailtext.
export const WORKFLOW_STEPS_EMAIL = [
  { key: 'input', label: '1 · Input & Kontext' },
  { key: 'mapping_review', label: '2 · E-Mail-Angebot (Stopp)' },
];

export function workflowSteps(offerType) {
  if (offerType === 'bestand') return WORKFLOW_STEPS_BESTAND;
  if (offerType === 'email') return WORKFLOW_STEPS_EMAIL;
  return WORKFLOW_STEPS;
}

export function stepForStatus(offerType, status) {
  const steps = workflowSteps(offerType);
  const idx = steps.findIndex(s => s.key === status || (s.statuses || []).includes(status));
  return idx >= 0 ? idx + 1 : (PROPOSAL_STATUSES[status]?.step ?? 1);
}