// Gemeinsame Duplikat-Prüfung für CRM-Deals — genutzt vom Posteingangs-Scan
// (Backend) und vom Deal-Dialog (Frontend). Keine Kopien anlegen.
import { FREEMAIL_DOMAINS, domainOf } from './senderLists.js';

export const CLOSED_STAGES = ['won', 'lost', 'ordered', 'declined'];

const norm = (s) =>
  String(s || '').toLowerCase()
    .replace(/gmbh|g\.m\.b\.h\.|e\.u\.|kg|og|ag|d\.o\.o\.|holding|&|und/g, '')
    .replace(/[^a-z0-9äöüß]/g, '')
    .trim();

// Existiert in der Pipeline bereits ein offener Deal zu diesem Kontakt / dieser Firma?
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