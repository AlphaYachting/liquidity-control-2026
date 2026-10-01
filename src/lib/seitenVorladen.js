// Lädt den Code der Alltagsseiten nach dem Start im Hintergrund vor.
// Ohne Vorladen holt der erste Besuch jeder Seite ihren Code erst beim Klick —
// nach jeder Veröffentlichung kostete das gemessen 0,5–1,3 s je Seite.
// Die Seiten werden nacheinander und erst im Leerlauf geladen, damit der Start
// der App und ihre Datenabfragen Vorrang haben.
const ALLTAGSSEITEN = [
  () => import('@/pages/MyDay'),
  () => import('@/pages/Dashboard'),
  () => import('@/pages/Projects'),
  () => import('@/pages/ProjectDetail'),
  () => import('@/pages/sprint/SprintHeute'),
  () => import('@/pages/sprint/SprintProjekte'),
  () => import('@/pages/sprint/SprintDetail'),
  () => import('@/pages/sprint/SprintUebersicht'),
  () => import('@/pages/sprint/SprintMilestoneDetail'),
  () => import('@/pages/Zeiten'),
  () => import('@/pages/CrmBoard'),
  () => import('@/pages/CrmInbox'),
  () => import('@/pages/CrmEmails'),
  () => import('@/pages/CrmDealDetail'),
  () => import('@/pages/ConfirmedOrders'),
  () => import('@/pages/InvoiceReady'),
];

let gestartet = false;

export function ladeAlltagsseitenVor() {
  if (gestartet) return;
  gestartet = true;
  const start = () => {
    let i = 0;
    const naechste = () => {
      if (i >= ALLTAGSSEITEN.length) return;
      ALLTAGSSEITEN[i++]().catch(() => {}).finally(() => setTimeout(naechste, 150));
    };
    naechste();
  };
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(() => setTimeout(start, 3000));
  } else {
    setTimeout(start, 4000);
  }
}
