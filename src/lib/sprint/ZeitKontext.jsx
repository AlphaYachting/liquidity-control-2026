import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Ein Kanal für den Kontext: Seiten melden an, wo gearbeitet wird —
// die Zeiterfassung schlägt genau das vor, statt es erraten zu müssen.
const LEER = { project_id: null, ticket_id: null, quelle: 'keiner' };

const ZeitKontextCtx = createContext({ kontext: LEER, setKontext: () => {} });

export function ZeitKontextProvider({ children }) {
  const [kontext, setKontext] = useState(LEER);
  const wert = useMemo(() => ({ kontext, setKontext }), [kontext]);
  return <ZeitKontextCtx.Provider value={wert}>{children}</ZeitKontextCtx.Provider>;
}

export const useZeitKontext = () => useContext(ZeitKontextCtx).kontext;

// Anmelden beim Betreten, abmelden beim Verlassen.
export function useMeldeZeitKontext({ project_id, ticket_id = null, quelle = 'keiner' }, aktiv = true) {
  const { setKontext } = useContext(ZeitKontextCtx);
  useEffect(() => {
    if (!aktiv || !project_id) return undefined;
    setKontext({ project_id, ticket_id: ticket_id || null, quelle });
    return () => setKontext(LEER);
  }, [aktiv, project_id, ticket_id, quelle, setKontext]);
}