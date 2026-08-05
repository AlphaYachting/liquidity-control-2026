// Zentrale Pipeline-/Phasen-Konfiguration für das CRM-Modul
export const PIPELINES = {
  new_business: {
    label: 'Neukunden',
    stages: [
      { key: 'new_lead', label: 'Neuer Lead', color: 'bg-blue-100 text-blue-700' },
      { key: 'contacted', label: 'Kontaktiert', color: 'bg-sky-100 text-sky-700' },
      { key: 'meeting_confirmed', label: 'Termin bestätigt', color: 'bg-purple-100 text-purple-700' },
      { key: 'proposal_sent', label: 'Angebot übermittelt', color: 'bg-amber-100 text-amber-700' },
      { key: 'negotiation', label: 'Verhandlung', color: 'bg-orange-100 text-orange-700' },
    ],
    wonStage: 'won',
    lostStage: 'lost',
  },
  existing_customer: {
    label: 'Bestandskunden',
    stages: [
      { key: 'inquiry_received', label: 'Anfrage eingegangen', color: 'bg-blue-100 text-blue-700' },
      { key: 'evaluated', label: 'Bewertet', color: 'bg-sky-100 text-sky-700' },
      { key: 'estimated', label: 'Angebot / Aufwand geschätzt', color: 'bg-amber-100 text-amber-700' },
    ],
    wonStage: 'ordered',
    lostStage: 'declined',
  },
};

export const STAGE_LABELS = {
  new_lead: 'Neuer Lead', contacted: 'Kontaktiert',
  meeting_confirmed: 'Termin bestätigt', proposal_sent: 'Angebot übermittelt', negotiation: 'Verhandlung',
  won: 'Gewonnen ✓', lost: 'Verloren',
  inquiry_received: 'Anfrage eingegangen', evaluated: 'Bewertet', estimated: 'Angebot / Aufwand geschätzt',
  ordered: 'Beauftragt ✓', declined: 'Abgelehnt',
};

export const SOURCE_LABELS = {
  phone_ai: '📞 Telefon-KI', email: '✉️ E-Mail', manual: '✍️ Manuell',
  referral: '🤝 Empfehlung', website: '🌐 Website', other: 'Sonstige',
};

export const isClosedStage = (stage) => ['won', 'lost', 'ordered', 'declined'].includes(stage);
export const isWonStage = (stage) => ['won', 'ordered'].includes(stage);

export const eur = (n) => `€${Math.round(n || 0).toLocaleString('de-AT')}`;