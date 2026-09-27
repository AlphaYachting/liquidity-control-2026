// Frontend-Fassung der Duplikat-Prüfung (Logik wie base44/shared/crmDuplicate.js).
// Die Vorschau kann Dateien aus base44/ nicht laden, daher liegt sie hier.
const FREEMAIL_DOMAINS = [
  'gmail.com', 'gmx.at', 'gmx.net', 'gmx.de', 'outlook.com', 'hotmail.com', 'yahoo.com', 'yahoo.de',
  'icloud.com', 'aon.at', 'a1.net', 'web.de', 't-online.de', 'live.com', 'me.com', 'proton.me', 'protonmail.com',
];
const domainOf = (from) =>
  (String(from || '').toLowerCase().match(/@([a-z0-9.\-]+\.[a-z]{2,})/) || [])[1] || '';

export const CLOSED_STAGES = ['won', 'lost', 'ordered', 'declined'];

const norm = (s) =>
  String(s || '').toLowerCase()
    .replace(/gmbh|g\.m\.b\.h\.|e\.u\.|kg|og|ag|d\.o\.o\.|holding|&|und/g, '')
    .replace(/[^a-z0-9äöüß]/g, '')
    .trim();

export function findDuplicateDeal(openDeals, { contactEmail, senderDomain, companyName }) {
  const email = String(contactEmail || '').toLowerCase().trim();
  const domain = senderDomain || domainOf(email);
  const company = norm(companyName);
  const domainUsable = domain && !FREEMAIL_DOMAINS.includes(domain);
  return openDeals.find((d) => {
    const dEmail = String(d.contact_email || '').toLowerCase().trim();
    if (email && dEmail && email === dEmail) return true;
    if (domainUsable && dEmail.endsWith('@' + domain)) return true;
    const dCompany = norm(d.company_name || d.linked_customer_name);
    if (company && dCompany && company.length >= 4 && (dCompany === company || dCompany.includes(company) || company.includes(dCompany))) return true;
    return false;
  });
}