import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { RITTLER } from '@/components/sprint/sprintConfig';
import { istInhaber } from '@/lib/rueckmeldung/rueckmeldung';
import NeuigkeitenBuehne, { BuehneKnopf, BUEHNE_RAHMEN, BUEHNE_RAHMEN_STIL } from './NeuigkeitenBuehne';
import { VEROEFFENTLICHT_KEY, ladeVeroeffentlichte, sichtbar } from '@/lib/neuigkeiten';

// Kleines Symbol neben der Suche: alle bisherigen Ausgaben „Was ist neu" zum Nachlesen
export default function NeuigkeitenKnopf() {
  const { user } = useAuth();
  const zugriff = useZugriff();
  const [offen, setOffen] = useState(false);
  const { data: ausgaben = [], isLoading } = useQuery({
    queryKey: VEROEFFENTLICHT_KEY, queryFn: ladeVeroeffentlichte, enabled: offen, staleTime: 5 * 60 * 1000,
  });
  const liste = ausgaben.filter((a) => sichtbar(a, zugriff));

  return (
    <>
      <button
        type="button"
        onClick={() => setOffen(true)}
        title="Was ist neu"
        aria-label="Was ist neu"
        className="shrink-0 flex items-center justify-center hover:bg-muted transition-colors"
        style={{ height: 38, width: 38, borderRadius: 3, border: `1px solid ${RITTLER.line}`, backgroundColor: RITTLER.white }}
      >
        <Sparkles className="w-4 h-4" style={{ color: RITTLER.textSecondary }} />
      </button>
      <Dialog open={offen} onOpenChange={setOffen}>
        {/* Archiv im selben Auftritt wie das Begrüßungsfenster — neueste Ausgabe oben, ältere darunter */}
        <DialogContent className={BUEHNE_RAHMEN} style={BUEHNE_RAHMEN_STIL}>
          <NeuigkeitenBuehne
            ausgaben={isLoading ? [] : liste}
            Titel={DialogTitle}
            Beschreibung={DialogDescription}
            abzeichen="Neuigkeiten"
            leer={(
              <p className="text-[13px]" style={{ color: RITTLER.textSecondary }}>
                {isLoading ? 'Wird geladen …' : 'Noch keine Neuigkeiten veröffentlicht.'}
              </p>
            )}
            fuss={(
              <>
                {istInhaber(user) ? (
                  <Link to="/neuigkeiten" onClick={() => setOffen(false)} className="text-[12.5px] font-semibold underline" style={{ color: RITTLER.black }}>
                    Ausgaben verwalten
                  </Link>
                ) : <span />}
                <BuehneKnopf onClick={() => setOffen(false)}>Schließen</BuehneKnopf>
              </>
            )}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
