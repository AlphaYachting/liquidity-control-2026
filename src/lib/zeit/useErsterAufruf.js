import { useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { stempleErstenAufruf } from './arbeitstag';

// Setzt den Zeitstempel „Tool geöffnet“ — beim Start und wenn das Fenster wieder
// in den Vordergrund kommt (falls die App über Mitternacht offen blieb).
// Höchstens eine Prüfung je Person und Tag; danach entscheidet localStorage ohne Anfrage.
export function useErsterAufruf() {
  const { user } = useAuth();
  const email = user?.email;
  useEffect(() => {
    if (!email) return undefined;
    stempleErstenAufruf(email);
    const sichtbar = () => { if (document.visibilityState === 'visible') stempleErstenAufruf(email); };
    document.addEventListener('visibilitychange', sichtbar);
    window.addEventListener('focus', sichtbar);
    return () => {
      document.removeEventListener('visibilitychange', sichtbar);
      window.removeEventListener('focus', sichtbar);
    };
  }, [email]);
}
