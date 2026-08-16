// Auswahllisten für die Personenverwaltung — deckungsgleich mit dem TeamMember-Schema
export const PERSON_COLORS = [
  { hex: '#2E5AAC', label: 'Blau' },
  { hex: '#1F6F6B', label: 'Petrol' },
  { hex: '#5B3E96', label: 'Violett' },
  { hex: '#8A4B2A', label: 'Kupfer' },
  { hex: '#465A70', label: 'Schiefer' },
  { hex: '#7A2E5E', label: 'Beere' },
  { hex: '#145C86', label: 'Stahlblau' },
  { hex: '#33415C', label: 'Nachtblau' },
];

export const SYSTEM_ROLES = [
  { key: 'gf', label: 'Führung / Management' },
  { key: 'pm', label: 'Projektleitung' },
  { key: 'teammitglied', label: 'Produktion' },
];

export const TICKET_ROLES = ['Beratung', 'Konzept', 'Text', 'Grafik', 'Web', 'Media', 'QS'];