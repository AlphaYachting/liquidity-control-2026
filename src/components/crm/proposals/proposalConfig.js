export const PROPOSAL_STATUSES = {
  input: { label: 'Input & Kontext', color: 'bg-slate-100 text-slate-600', step: 1 },
  analysis_review: { label: 'Analyse zur Freigabe', color: 'bg-amber-100 text-amber-700', step: 2 },
  mapping_review: { label: 'Mapping zur Freigabe', color: 'bg-blue-100 text-blue-700', step: 3 },
  config_ready: { label: 'Freigegeben — bereit zum Rendern', color: 'bg-violet-100 text-violet-700', step: 4 },
  rendered: { label: 'PDF erstellt ✓', color: 'bg-emerald-100 text-emerald-600', step: 5 },
  error: { label: 'Fehler', color: 'bg-red-100 text-red-600', step: 0 },
};

export const MODE_LABELS = { full: 'Vollversion', short: 'Kurzform' };

export const SIGNERS = ['Alfons Rittler', 'Sebastian Haslinger'];

export const WORKFLOW_STEPS = [
  { key: 'input', label: '1 · Input & Kontext' },
  { key: 'analysis_review', label: '2 · Analyse (Stopp 1)' },
  { key: 'mapping_review', label: '3 · Mapping (Stopp 2)' },
  { key: 'config_ready', label: '4 · Config' },
  { key: 'rendered', label: '5 · PDF' },
];