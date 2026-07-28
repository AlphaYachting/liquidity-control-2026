// Validiert vom Client übergebene Datei-URLs vor einem serverseitigen fetch (SSRF-Schutz).
// Erlaubt ausschließlich https-URLs auf vertrauenswürdige Base44-Storage-Hosts.
const ALLOWED_HOST_SUFFIXES = [
  '.base44.com',
  'base44.com',
  '.base44.app',
  'base44.app',
  '.googleapis.com',
  '.amazonaws.com',
];

export function assertSafeFileUrl(raw: unknown): string {
  let url: URL;
  try {
    url = new URL(String(raw));
  } catch {
    throw new Error('Ungültige file_url');
  }
  if (url.protocol !== 'https:') throw new Error('Nur https-URLs sind erlaubt');
  const host = url.hostname.toLowerCase();
  // Private/interne Ziele grundsätzlich blockieren
  if (
    host === 'localhost' ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new Error('Zugriff auf interne Adressen ist nicht erlaubt');
  }
  const allowed = ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith(s));
  if (!allowed) throw new Error('file_url muss eine Base44-Storage-URL sein');
  return url.toString();
}