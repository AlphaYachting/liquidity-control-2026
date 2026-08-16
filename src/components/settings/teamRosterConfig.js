// Auswahllisten für die Personenverwaltung — deckungsgleich mit dem TeamMember-Schema
export const PERSON_COLORS = [
  { hex: '#1D4ED8', label: 'Blau' },
  { hex: '#0E9488', label: 'Türkis' },
  { hex: '#16A34A', label: 'Grün' },
  { hex: '#CA8A04', label: 'Ocker' },
  { hex: '#EA580C', label: 'Orange' },
  { hex: '#DC2626', label: 'Rot' },
  { hex: '#DB2777', label: 'Magenta' },
  { hex: '#9333EA', label: 'Violett' },
  { hex: '#475569', label: 'Schiefer' },
];

export const SYSTEM_ROLES = [
  { key: 'gf', label: 'Führung / Management' },
  { key: 'pm', label: 'Projektleitung' },
  { key: 'teammitglied', label: 'Produktion' },
];

export const TICKET_ROLES = ['Beratung', 'Konzept', 'Text', 'Grafik', 'Web', 'Media', 'QS'];