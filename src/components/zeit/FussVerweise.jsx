import React from 'react';
import { RITTLER } from '@/components/sprint/sprintConfig';

// Nebenhandlungen sind Verweise, keine zweiten Knöpfe.
export default function FussVerweise({ links, rechts }) {
  return (
    <div className="flex items-center justify-between mt-3">
      {[links, rechts].map((v, i) =>
        v ? (
          <button
            key={i}
            type="button"
            onClick={v.onClick}
            className="text-[12.5px] underline"
            style={{ color: RITTLER.textSecondary }}
          >
            {v.text}
          </button>
        ) : (
          <span key={i} />
        )
      )}
    </div>
  );
}