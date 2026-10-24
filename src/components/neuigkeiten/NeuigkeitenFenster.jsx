import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Sparkles } from 'lucide-react';
import {
  AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/lib/AuthContext';
import { useZugriff } from '@/lib/useZugriff';
import { RITTLER } from '@/components/sprint/sprintConfig';
import NeuigkeitInhalt from './NeuigkeitInhalt';
import {
  VEROEFFENTLICHT_KEY, GELESEN_KEY, ladeVeroeffentlichte, ladeGelesene, ungelesen, alsGelesenMarkieren,
} from '@/lib/neuigkeiten';

// „Was ist neu" — erscheint nach einem veröffentlichten Update einmal je Person beim Öffnen der App.
// Bewusst blockierend: es schließt nur über „Verstanden", damit die Neuerungen gelesen werden.
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
      <AlertDialogContent className="max-w-[520px] max-h-[85vh] overflow-y-auto" style={{ borderRadius: 4 }}>
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: RITTLER.textSecondary }}>
          <Sparkles className="w-4 h-4" />
          <AlertDialogTitle className="text-[12px] font-semibold">Was ist neu im Agency Manager</AlertDialogTitle>
        </div>
        <AlertDialogDescription className="sr-only">Neuerungen seit deinem letzten Besuch</AlertDialogDescription>
        <div className="space-y-6">
          {offen.map((a) => <NeuigkeitInhalt key={a.id} ausgabe={a} />)}
        </div>
        <p className="text-[12px]" style={{ color: RITTLER.textSecondary }}>
          Alle Ausgaben findest du später über das Symbol neben der Suche. Etwas fehlt oder hakt? Gleich daneben: Rückmeldung.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={verstanden}
            disabled={speichert}
            className="h-9 px-5 text-[13px] font-semibold flex items-center gap-2 disabled:opacity-60"
            style={{ borderRadius: 3, backgroundColor: RITTLER.black, color: RITTLER.white }}
          >
            {speichert && <Loader2 className="w-4 h-4 animate-spin" />}
            Verstanden
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
