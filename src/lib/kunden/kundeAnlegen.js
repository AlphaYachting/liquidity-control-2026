import { base44 } from '@/api/base44Client';

// Der EINE Anlageweg für Kunden. Nur diese Datei legt Kunden an — jede Oberfläche
// (Kundenverzeichnis, Assistent, CRM-Übergabe) geht über den Kunden-Baustein
// (ClientLinkStep) und landet hier. Regeln:
//   1. Ohne sevDesk-Kontakt-ID entsteht kein Kunde.
//   2. Ein sevDesk-Kontakt gehört zu genau einem Kunden (Prüfung über die ID).
//   3. Danach Dublettenprüfung über den Namen.
//   4. AGB-Version ist mit „offen" vorbelegt.

// Vergleichsschlüssel: Groß/Klein, Leerzeichen und Satzzeichen zählen nicht
export const kundenSchluessel = (name) =>
  String(name || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

export async function findeKunde(name, ausserId) {
  const schluessel = kundenSchluessel(name);
  if (!schluessel) return null;
  const alle = await base44.entities.Client.list('-created_date', 5000);
  return alle.find((c) => c.id !== ausserId && kundenSchluessel(c.name) === schluessel) || null;
}

// Kunde, der bereits mit diesem sevDesk-Kontakt verknüpft ist
export async function findeKundeNachSevdesk(sevdeskId, ausserId) {
  const id = String(sevdeskId || '').trim();
  if (!id) return null;
  const treffer = await base44.entities.Client.filter({ sevdesk_contact_id: id }, '-created_date', 5);
  return treffer.find((c) => c.id !== ausserId) || null;
}

// Klärt einen Kundennamen vor dem Speichern.
// Ergebnis: { bestehend } → vorhandenen Kunden verwenden, oder { name } → dieser Name darf gespeichert werden.
export async function kundennameKlaeren(name, { ausserId, erlaubeVerwenden = true } = {}) {
  let aktuell = String(name || '').trim();
  for (;;) {
    const treffer = await findeKunde(aktuell, ausserId);
    if (!treffer) return { name: aktuell };
    const bewusst = window.confirm(
      `Den Kunden „${treffer.name}“ gibt es bereits.\n\n` +
      'OK = bewusst ein Duplikat anlegen (mit Zusatzbezeichnung)\n' +
      (erlaubeVerwenden ? 'Abbrechen = den bestehenden Kunden verwenden' : 'Abbrechen = nicht speichern')
    );
    if (!bewusst) {
      if (erlaubeVerwenden) return { bestehend: treffer };
      throw new Error(`Kunde „${treffer.name}“ existiert bereits — nicht gespeichert.`);
    }
    const zusatz = window.prompt('Zusatzbezeichnung für das Duplikat (z. B. Standort, Abteilung):', 'Duplikat');
    if (!zusatz || !zusatz.trim()) throw new Error('Ohne Zusatzbezeichnung wird kein Duplikat angelegt.');
    aktuell = `${String(name).trim()} (${zusatz.trim()})`;
  }
}

const ADRESSFELDER = ['street', 'zip', 'city', 'country_code'];

// Legt einen Kunden an — oder liefert den bestehenden, wenn es ihn schon gibt.
export async function kundeAnlegen(daten) {
  const sevdeskId = String(daten.sevdesk_contact_id || '').trim();
  if (!sevdeskId) {
    throw new Error('Ohne sevDesk-Kontakt wird kein Kunde angelegt — bitte zuerst mit sevDesk verknüpfen.');
  }

  // 1) Derselbe sevDesk-Kontakt ist schon ein Kunde → diesen verwenden, nie doppelt anlegen
  const verknuepft = await findeKundeNachSevdesk(sevdeskId);
  if (verknuepft) return verknuepft;

  // 2) Namensgleicher Kunde
  const geklaert = await kundennameKlaeren(daten.name);
  if (geklaert.bestehend) {
    const bestehend = geklaert.bestehend;
    if (bestehend.sevdesk_contact_id) return bestehend;
    // Bestehender Kunde ohne sevDesk-Bezug bekommt die Verknüpfung, fehlende Adresse wird ergänzt
    const patch = { sevdesk_contact_id: sevdeskId };
    ADRESSFELDER.forEach((k) => { if (!bestehend[k] && daten[k]) patch[k] = daten[k]; });
    const aktualisiert = await base44.entities.Client.update(bestehend.id, patch);
    return { ...bestehend, ...aktualisiert, ...patch };
  }

  // 3) Neu
  return base44.entities.Client.create({
    ...daten,
    name: geklaert.name,
    sevdesk_contact_id: sevdeskId,
    agb_version: daten.agb_version || 'offen',
  });
}
