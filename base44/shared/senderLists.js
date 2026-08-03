// EINE gemeinsame Quelle für Absenderlisten — Backend-Funktionen und Frontend
// importieren beide diese Datei. Keine Kopien anlegen.

export const INTERNAL_DOMAINS = ['rittler.co', 'rico-office.at'];

export const SYSTEM_DOMAINS = [
  'awork.com', 'brevo.com', 'm.brevo.com', 'sevdesk.de', 'sevdesk.com', 'wordpress.com',
  'google.com', 'microsoft.com', 'linkedin.com', 'mailchimp.com', 'atlassian.com', 'base44.com',
  'paypal.com', 'stripe.com', 'amazonses.com', 'facebookmail.com', 'instagram.com',
];

export const FREEMAIL_DOMAINS = [
  'gmail.com', 'gmx.at', 'gmx.net', 'gmx.de', 'outlook.com', 'hotmail.com', 'yahoo.com', 'yahoo.de',
  'icloud.com', 'aon.at', 'a1.net', 'web.de', 't-online.de', 'live.com', 'me.com', 'proton.me', 'protonmail.com',
];

export const domainOf = (from) =>
  (String(from || '').toLowerCase().match(/@([a-z0-9.\-]+\.[a-z]{2,})/) || [])[1] || '';

const inList = (domain, list) => list.some((d) => domain === d || domain.endsWith('.' + d));

export const isInternalDomain = (domain) => inList(domain, INTERNAL_DOMAINS);
export const isSystemDomain = (domain) => inList(domain, SYSTEM_DOMAINS);
export const isFreemailDomain = (domain) => FREEMAIL_DOMAINS.includes(domain);