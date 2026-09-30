import { base44 } from '@/api/base44Client';

// Vergleichsschlüssel: Groß/Klein, Leerzeichen und Satzzeichen zählen nicht
export const kundenSchluessel = (name) =>
  String(name || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '');

export async function findeKunde(name, ausserId) {
  const schluessel = kundenSchluessel(name);
  if (!schluessel) return null;
  const alle = await base44.entities.Client.list('-created_date', 5000);
  return alle.find((c) => c.id !== ausserId && kundenSchluessel(c.name) === schluessel) || null;
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

// Legt einen Kunden an — oder liefert den bestehenden, wenn die Person das wählt.
export async function kundeAnlegen(daten) {
  const geklaert = await kundennameKlaeren(daten.name);
  if (geklaert.bestehend) return geklaert.bestehend;
  return base44.entities.Client.create({ ...daten, name: geklaert.name });
}