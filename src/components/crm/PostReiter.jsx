import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useZugriff } from '@/lib/useZugriff';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Ein Einstieg „Post" in der Navigation — die einzelnen Postmodule sind Reiter derselben Leiste.
// Jede Person sieht nur die Reiter, die sie nach ihren Rechten öffnen darf.
// Support ist seit 24.10.2026 ein eigener Navigationspunkt für alle — kein Reiter mehr, und auf der
// Support-Seite erscheint die Reiterleiste nicht.
export const POST_REITER = [
  { key: 'posteingang', label: 'Posteingang', to: '/crm/inbox', recht: 'leitung' },
  { key: 'office', label: 'Office', to: '/crm/inbox?kanal=office', recht: ['leitung', 'support'] },
  { key: 'eskalationen', label: 'Eskalationen', to: '/crm/escalations', recht: 'leitung' },
  { key: 'alle', label: 'Alle E-Mails', to: '/crm/emails', recht: 'leitung' },
];

function aktiverReiter(pathname, search) {
  const p = new URLSearchParams(search);
  const kanal = p.get('kanal') || (p.get('filter') === 'support' ? 'support' : null);
  if (pathname.startsWith('/crm/escalations')) return 'eskalationen';
  if (pathname.startsWith('/crm/emails')) return 'alle';
  if (pathname.startsWith('/crm/inbox')) return kanal === 'support' ? 'support' : kanal === 'office' ? 'office' : 'posteingang';
  return null;
}

export default function PostReiter() {
  const { pathname, search } = useLocation();
  const zugriff = useZugriff();
  const aktiv = aktiverReiter(pathname, search);
  if (aktiv === 'support') return null;
  const reiter = POST_REITER.filter((r) => zugriff.darf(r.recht));
  if (reiter.length < 2) return null;
  return (
    <nav aria-label="Post" className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: RITTLER.line }}>
      {reiter.map((r) => {
        const an = r.key === aktiv;
        return (
          <Link
            key={r.key}
            to={r.to}
            aria-current={an ? 'page' : undefined}
            className="px-3 py-2 text-[13px] whitespace-nowrap -mb-px"
            style={{
              color: an ? RITTLER.black : RITTLER.textSecondary,
              fontWeight: an ? 600 : 500,
              borderBottom: `2px solid ${an ? RITTLER.black : 'transparent'}`,
            }}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}
