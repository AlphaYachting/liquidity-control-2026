import { base44 } from '@/api/base44Client';

// Zentraler Zugriff auf die E-Mail-Datenbank über die Backend-Funktion.
export async function emailApi(action, payload = {}) {
  const res = await base44.functions.invoke('emailDbApi', { action, ...payload });
  return res.data;
}