import React, { useState } from 'react';
import { Box, BoxKopf, BoxInhalt } from '@/components/shared/Box';

// Einklappbarer Abschnitt — gibt allen Bereichen der Deal-Seite die gleiche Hülle,
// damit lange Inhalte (Anfrage, E-Mail-Verlauf, Antwort) die Seite nicht überfluten.
export default function CollapsibleSection({ icon: Icon, title, hint, defaultOpen = false, action, children }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Box className="overflow-hidden">
      <BoxKopf
        titel={title}
        symbol={Icon}
        hinweis={hint}
        aktion={open ? action : null}
        einklappbar
        offen={open}
        onToggle={() => setOpen((o) => !o)}
      />
      {open && <BoxInhalt>{children}</BoxInhalt>}
    </Box>
  );
}