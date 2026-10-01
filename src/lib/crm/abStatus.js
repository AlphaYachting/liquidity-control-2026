// AB-Status auf Deutsch — einheitlich für Projektübersicht und Abrechnung
export const AB_STATUS = {
  draft: { label: 'AB-Entwurf — noch nicht an den Kunden versendet', className: 'bg-status-attention-surface text-status-attention' },
  sent: { label: 'versendet', className: 'bg-status-info-surface text-status-info' },
  confirmed: { label: 'bestätigt', className: 'bg-status-done-surface text-status-done-text' },
  completed: { label: 'abgeschlossen', className: 'bg-muted text-muted-foreground' },
  cancelled: { label: 'storniert', className: 'bg-muted text-muted-foreground' },
  unclear: { label: 'unklar', className: 'bg-muted text-muted-foreground' },
};

export const abStatus = (s) => AB_STATUS[s] || { label: s || '—', className: 'bg-muted text-muted-foreground' };

export const abLinks = (o) => [
  { label: 'Angebot', url: o?.angebot_url },
  { label: 'AB in sevDesk', url: o?.sevdesk_order_url },
  { label: 'AB-PDF', url: o?.ab_pdf_url },
].filter((l) => l.url);

export const ABRECHNUNG_LABELS = { einmalig: 'einmalig', monatlich: 'monatlich', nach_aufwand: 'nach Aufwand' };

export const ITEM_STATUS_LABELS = { not_started: 'Nicht begonnen', in_progress: 'In Arbeit', completed: 'Fertig', blocked: 'Blockiert' };

export const hatUmfang = (o, items = []) => Boolean(
  o.leistungszeitraum || o.liefertermin || o.korrekturschleifen != null || o.mehrkosten_regel
  || o.nicht_enthalten?.length || items.some((i) => i.description || i.lieferumfang?.length)
);

export const fmtTag = (d) => (d ? new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');