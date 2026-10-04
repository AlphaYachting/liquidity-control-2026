import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { UEBERNAHME_KEY, brauchtAntwort, ladeMeineUebernahme } from '@/lib/sprint/uebernahme';

// Solange noch Alttickets ohne Antwort bei der Person liegen, steht dieser Knopf oben in „Mein Tag".
// Er verschwindet von selbst, sobald alles bestätigt ist.
export default function MeinTagUebernahme({ email }) {
  const { data } = useQuery({
    queryKey: UEBERNAHME_KEY(email),
    enabled: !!email,
    staleTime: 60 * 1000,
    queryFn: () => ladeMeineUebernahme(email),
  });
  const offen = (data?.tickets || []).filter(brauchtAntwort).length;
  if (!offen) return null;
  return (
    <Link
      to="/sprint/uebernahme"
      className="h-11 px-4 inline-flex items-center rounded bg-primary text-sm font-bold text-white hover:bg-primary/90"
    >
      Übernahme bestätigen · {offen} offen
    </Link>
  );
}
