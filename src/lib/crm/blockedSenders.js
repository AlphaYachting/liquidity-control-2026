// Prüft, ob ein Absender durch einen Posteingangs-Filter ausgeblendet werden soll.
// Ein Eintrag trifft als ganze Adresse (a@b.at) oder als Domain (b.at bzw. @b.at).
export function isBlockedSender(email, rules = []) {
  const addr = String(email || '').trim().toLowerCase();
  if (!addr) return false;
  return rules.some((r) => {
    if (r.is_active === false) return false;
    const v = String(r.value || '').trim().toLowerCase();
    if (!v) return false;
    if (v.includes('@') && !v.startsWith('@')) return addr === v;
    const domain = v.startsWith('@') ? v.slice(1) : v;
    return addr.endsWith('@' + domain);
  });
}