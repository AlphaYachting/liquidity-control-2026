import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { RITTLER } from '@/components/sprint/sprintConfig';
import NeuigkeitenBuehne, { BuehneKnopf, BUEHNE_RAHMEN, BUEHNE_RAHMEN_STIL } from './NeuigkeitenBuehne';
import {
  VEROEFFENTLICHT_KEY, GELESEN_KEY, ladeVeroeffentlichte, ladeGelesene, ungelesen, alsGelesenMarkieren,
} from '@/lib/neuigkeiten';

// Der Hinweis im Fuß — im Fenster und in der Vorschau gleich
export const FUSS_HINWEIS = (
  <p className="text-[12px] flex-1 min-w-[220px]" style={{ color: RITTLER.textSecondary }}>
    Zum Nachlesen: das Funkel-Symbol neben der Suche. Etwas fehlt oder hakt? Gleich daneben: Rückmeldung.
  </p>
);

// „Was ist neu" — erscheint nach einem veröffentlichten Update einmal je Person beim Öffnen der App.
// Bewusst blockierend: es schließt nur über „Los geht’s", damit die Neuerungen gelesen werden.
// Lädt erst kurz nach dem Start, damit die geöffnete Seite Vorrang hat.
export default function NeuigkeitenFenster() {
  const { user } = useAuth();
  const email = user?.email;
  const zugriff = useZugriff();
  const qc = useQueryClient();
  const [bereit, setBereit] = useState(false);
  const [speichert, setSpeichert] = useState(false);
  const [geschlossen, setGeschlossen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setBereit(true), 2500);
    return () => clearTimeout(t);
  }, []);

  const aktiv = bereit && !!email && !zugriff.isLoading;
  const { data: ausgaben } = useQuery({ queryKey: VEROEFFENTLICHT_KEY, queryFn: ladeVeroeffentlichte, enabled: aktiv, staleTime: 5 * 60 * 1000 });
  const { data: gelesene } = useQuery({ queryKey: GELESEN_KEY(email), queryFn: () => ladeGelesene(email), enabled: aktiv, staleTime: 5 * 60 * 1000 });

  const offen = ausgaben && gelesene ? ungelesen(ausgaben, gelesene, zugriff) : [];
  const zeigen = !geschlossen && offen.length > 0;

  const verstanden = async () => {
    setSpeichert(true);
    try {
      await alsGelesenMarkieren(offen, email);
      await qc.invalidateQueries({ queryKey: GELESEN_KEY(email) });
    } catch {
      // Speichern fehlgeschlagen: für diese Sitzung schließen, beim nächsten Öffnen erscheint es wieder
    }
    setSpeichert(false);
    setGeschlossen(true);
  };

  if (!zeigen) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent className={BUEHNE_RAHMEN} style={BUEHNE_RAHMEN_STIL}>
        <NeuigkeitenBuehne
          ausgaben={offen}
          Titel={AlertDialogTitle}
          Beschreibung={AlertDialogDescription}
          fuss={(
            <>
              {FUSS_HINWEIS}
              <BuehneKnopf onClick={verstanden} disabled={speichert}>
                {speichert && <Loader2 className="w-4 h-4 animate-spin" />}
                Los geht’s
              </BuehneKnopf>
            </>
          )}
        />
      </AlertDialogContent>
    </AlertDialog>
  );
}
