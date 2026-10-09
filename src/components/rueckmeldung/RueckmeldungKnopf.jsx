import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquarePlus } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { RITTLER, STATUS_COLORS } from '@/components/sprint/sprintConfig';
import RueckmeldungDialog from './RueckmeldungDialog';
import { istInhaber, NEU_KEY, ladeNeue, EIGENE_KEY, ladeEigene, hatNeuigkeit } from '@/lib/rueckmeldung/rueckmeldung';

// Immer sichtbar neben der Kopfsuche. Für den Inhaber zeigt er die Zahl neuer Meldungen
// (rot, sobald jemand wegen eines Fehlers nicht weiterkommt); für alle anderen einen Punkt,
// wenn sich am Status einer eigenen Meldung etwas getan hat.
export default function RueckmeldungKnopf() {
  const { user } = useAuth();
  const inhaber = istInhaber(user);
  const [offen, setOffen] = useState(false);
  const [startReiter, setStartReiter] = useState('neu');
  // Erst kurz nach dem Start laden — die geöffnete Seite hat Vorrang.
  const [bereit, setBereit] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBereit(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const { data: neu } = useQuery({
    queryKey: NEU_KEY,
    queryFn: ladeNeue,
    enabled: bereit && inhaber,
    refetchInterval: 2 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  const { data: eigene = [] } = useQuery({
    queryKey: EIGENE_KEY(user?.email),
    queryFn: () => ladeEigene(user.email),
    enabled: bereit && !!user?.email && !inhaber,
    staleTime: 10 * 60 * 1000,
  });

  // offen in den Abhängigkeiten: nach dem Schließen neu prüfen, ob "Meine Meldungen" angesehen wurde
  const punkt = useMemo(() => !inhaber && hatNeuigkeit(eigene), [inhaber, eigene, offen]);
  const anzahl = neu?.anzahl || 0;
  const alarm = (neu?.blockiert || 0) > 0;

  const oeffnen = () => {
    setStartReiter(punkt ? 'meine' : 'neu');
    setOffen(true);
  };

  const titel = inhaber && anzahl
    ? `${anzahl} neue Rückmeldung${anzahl === 1 ? '' : 'en'}${alarm ? ` · ${neu.blockiert} blockiert jemanden` : ''}`
    : punkt ? 'Es gibt Neuigkeiten zu deinen Meldungen' : 'Fehler, Wunsch oder Anregung melden';

  return (
    <>
      <button
        type="button"
        onClick={oeffnen}
        title={titel}
        className="relative shrink-0 flex items-center gap-1.5 px-3 text-[13px] font-semibold hover:bg-muted transition-colors"
        style={{ height: 38, borderRadius: 3, border: `1px solid ${RITTLER.line}`, color: RITTLER.black, backgroundColor: RITTLER.white }}
      >
        <MessageSquarePlus className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />
        <span className="hidden sm:inline">Rückmeldung</span>
        {inhaber && anzahl > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10.5px] font-bold flex items-center justify-center"
            style={{ backgroundColor: alarm ? STATUS_COLORS.critical : RITTLER.black, color: '#ffffff' }}
          >
            {anzahl}
          </span>
        )}
        {punkt && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS.attention }} />
        )}
      </button>
      <RueckmeldungDialog open={offen} onOpenChange={setOffen} neuAnzahl={anzahl} startReiter={startReiter} />
    </>
  );
}
