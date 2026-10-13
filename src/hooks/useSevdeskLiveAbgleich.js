import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { abrechnungNeuLaden } from '@/lib/billing/planFolgt';

// Holt den echten sevDesk-Stand der offenen Abrechnungsanweisungen — beim Öffnen der
// Ansicht und wenn man aus einem anderen Tab (etwa sevDesk) zurückkommt.
// Jede Anweisung höchstens einmal pro Minute; der Abgleich selbst schreibt nur, was in
// sevDesk Tatsache ist (Status, Rechnungsdatensatz), nie Beträge.
const istOffen = (b) => Boolean(b?.sevdesk_invoice_id)
  && (b.status === 'sent_to_backoffice' || (b.status === 'invoice_created' && !b.linked_invoice_id));

const SPERRE_MS = 60 * 1000;
const zuletztGeprueft = new Map(); // id → Zeitpunkt, für alle Ansichten gemeinsam

export function useSevdeskLiveAbgleich(anweisungen = []) {
  const queryClient = useQueryClient();
  const [stand, setStand] = useState({ laeuft: false, geprueftAm: null, fehler: null, geaendert: 0 });
  const laeuft = useRef(false);
  const offeneIds = anweisungen.filter(istOffen).map((b) => b.id).sort();
  const schluessel = offeneIds.join(',');

  const abgleichen = useCallback(async (erzwingen = false) => {
    if (!schluessel || laeuft.current) return;
    const jetzt = Date.now();
    const ids = schluessel.split(',').filter((id) => erzwingen || jetzt - (zuletztGeprueft.get(id) || 0) > SPERRE_MS);
    if (ids.length === 0) return;
    ids.forEach((id) => zuletztGeprueft.set(id, jetzt));
    laeuft.current = true;
    setStand((s) => ({ ...s, laeuft: true, fehler: null }));
    try {
      const res = await base44.functions.invoke('abrechnungsstandAbgleichen', { ids });
      const d = res?.data || {};
      if (d.error) throw new Error(d.error);
      setStand({ laeuft: false, geprueftAm: d.geprueft_am || new Date().toISOString(), fehler: null, geaendert: d.geaendert || 0 });
      const etwasNeu = (d.geaendert || 0) > 0 || (d.ergebnis || []).some((e) => e.rechnungsdatensatz === 'anlegen');
      if (etwasNeu) abrechnungNeuLaden(queryClient);
    } catch (e) {
      setStand((s) => ({ ...s, laeuft: false, fehler: e?.response?.data?.error || e?.message || 'Abgleich fehlgeschlagen' }));
    } finally {
      laeuft.current = false;
    }
  }, [schluessel, queryClient]);

  useEffect(() => { abgleichen(false); }, [abgleichen]);

  useEffect(() => {
    const beiRueckkehr = () => { if (document.visibilityState === 'visible') abgleichen(false); };
    document.addEventListener('visibilitychange', beiRueckkehr);
    window.addEventListener('focus', beiRueckkehr);
    return () => {
      document.removeEventListener('visibilitychange', beiRueckkehr);
      window.removeEventListener('focus', beiRueckkehr);
    };
  }, [abgleichen]);

  return { ...stand, offen: offeneIds.length, jetztAbgleichen: () => abgleichen(true) };
}
