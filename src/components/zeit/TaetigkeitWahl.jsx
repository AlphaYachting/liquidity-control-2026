import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { rollenVon } from '@/lib/zeit/taetigkeit';

// Bei genau einer Rolle wird nichts gefragt, bei mehreren erscheint eine Reihe Knöpfe.
export default function TaetigkeitWahl({ email, wert, onWaehlen }) {
  const { data: rollen = [] } = useQuery({
    queryKey: ['rollenVon', email],
    enabled: !!email,
    queryFn: () => rollenVon(email),
  });

  if (rollen.length < 2) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-3">
      <span className="text-[11px] font-bold uppercase tracking-wide mr-1" style={{ color: RITTLER.textSecondary }}>
        Tätigkeit
      </span>
      {rollen.map((r) => {
        const aktiv = wert === r;
        return (
          <button
            key={r}
            type="button"
            onClick={() => onWaehlen(r)}
            className="h-7 px-2.5 rounded text-xs font-semibold border"
            style={{
              borderColor: aktiv ? RITTLER.black : RITTLER.line,
              backgroundColor: aktiv ? RITTLER.black : 'transparent',
              color: aktiv ? RITTLER.white : RITTLER.textSecondary,
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}