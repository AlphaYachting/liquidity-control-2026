import { PROJECT_TYPE_ORDER } from '@/components/sprint/projectTypes';

// Optionaler Startkeim für den Anlage-Wizard.
// Quelle: Location-State ({ seed: {...}, sprint: {...} }) oder Query-Parameter
// (?typ=&kunde=&pm=&titel=&groesse=&start=&liefertermin=).
// Fehlt der Startkeim, bleibt alles leer — der Wizard verhält sich manuell.
export function readWizardSeed(locationState) {
  const q = new URLSearchParams(window.location.search);
  const fromState = locationState?.seed || {};
  const type = fromState.type || q.get('typ') || '';

  const seed = {
    client_id: fromState.client_id || q.get('kunde') || '',
    type: PROJECT_TYPE_ORDER.includes(type) ? type : '',
    pm_email: fromState.pm_email || q.get('pm') || '',
    title: fromState.title || q.get('titel') || '',
    sprint_target: fromState.sprint_target || 'neu',
    existing_project_id: fromState.existing_project_id || '',
    stundensatz: fromState.stundensatz || '',
    kontingent_stunden: fromState.kontingent_stunden || '',
    recurring_contract_id: fromState.recurring_contract_id || '',
    modell: fromState.modell || 'aufwand',
  };

  const s = locationState?.sprint || {};
  const sprint = {
    size: s.size || q.get('groesse') || '',
    startDate: s.start_date || q.get('start') || '',
    deliveryDate: s.delivery_date || q.get('liefertermin') || '',
    discount: s.discount != null ? String(s.discount) : '',
    selected: Array.isArray(s.selected) ? s.selected : [],
  };

  return { seed, sprint };
}