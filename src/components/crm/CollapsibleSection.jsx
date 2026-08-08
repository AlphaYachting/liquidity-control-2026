import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';

// Einklappbarer Abschnitt — gibt allen Bereichen der Deal-Seite die gleiche Hülle,
// damit lange Inhalte (Anfrage, E-Mail-Verlauf, Antwort) die Seite nicht überfluten.
export default function CollapsibleSection({ icon: Icon, title, hint, defaultOpen = false, action, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border rounded-xl bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
          {Icon && <Icon className="w-4 h-4 text-primary shrink-0" />}
          <span className="text-sm font-semibold truncate">{title}</span>
          {hint && <span className="text-xs text-muted-foreground truncate">· {hint}</span>}
        </button>
        {open && action}
      </div>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}