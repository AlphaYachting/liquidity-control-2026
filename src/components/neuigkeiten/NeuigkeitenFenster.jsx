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
  VEROEFFENTLICHT_KEY, GELESEN_KEY, ladeVeroeffentlichte, ladeGelesene, ungelesen, alsGelesenMarkieren, tag,
} from '@/lib/neuigkeiten';

// Bewegung nur, wenn die Person keine reduzierte Bewegung eingestellt hat
const ANIMATION = `
@keyframes neuEin { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
@keyframes neuGlimmer { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: .9; transform: scale(1.08); } }
@keyframes neuFunkeln { 0%, 100% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(14deg) scale(1.12); } }
.neu-einblenden { animation: neuEin .45s cubic-bezier(.2,.7,.2,1) both; }
.neu-glimmer { animation: neuGlimmer 5s ease-in-out infinite; }
.neu-funkeln { animation: neuFunkeln 2.8s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .neu-einblenden, .neu-glimmer, .neu-funkeln { animation: none; } }
`;

// Wer hat etwas gewünscht? "John, Johannes" → zwei Personen
const wuenscher = (ausgaben) => [...new Set(ausgaben.flatMap((a) => (a.punkte || [])
  .flatMap((p) => String(p?.von || '').split(/,| und /).map((s) => s.trim()).filter(Boolean))))];

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

  const erste = offen[0];
  const weitere = offen.slice(1);
  const anzahl = offen.reduce((s, a) => s + (a.punkte || []).filter((p) => p?.text).length, 0);
  const namen = wuenscher(offen);

  return (
    <AlertDialog open>
      <style>{ANIMATION}</style>
      <AlertDialogContent
        className="max-w-[580px] w-[calc(100vw-32px)] p-0 gap-0 overflow-hidden max-h-[88vh] flex flex-col"
        style={{ borderRadius: 6 }}
      >
        {/* Kopf: schwarze Bühne mit pinkem Lichtfleck — die Neuigkeit soll als Ereignis wirken */}
        <div className="relative overflow-hidden px-7 pt-7 pb-6 shrink-0" style={{ backgroundColor: RITTLER.black, color: RITTLER.white }}>
          <div
            aria-hidden="true"
            className="neu-glimmer pointer-events-none absolute -top-24 -right-20 w-72 h-72"
            style={{ borderRadius: 999, background: 'radial-gradient(circle, hsl(var(--primary) / 0.75) 0%, hsl(var(--primary) / 0) 70%)' }}
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 -left-16 w-60 h-60"
            style={{ borderRadius: 999, background: 'radial-gradient(circle, hsl(var(--primary) / 0.22) 0%, hsl(var(--primary) / 0) 70%)' }}
          />
          <div className="relative">
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ borderRadius: 999, backgroundColor: RITTLER.pink, color: 'hsl(var(--primary-foreground))' }}
              >
                <Sparkles className="neu-funkeln w-3.5 h-3.5" />
                Update
              </span>
              {erste?.veroeffentlicht_am && (
                <span className="text-[12px] opacity-70">{tag(erste.veroeffentlicht_am)}</span>
              )}
            </div>
            <AlertDialogTitle className="mt-4 text-[26px] leading-[30px] font-bold tracking-tight">
              Was ist neu im Agency&nbsp;Manager
            </AlertDialogTitle>
            <AlertDialogDescription className="mt-2 text-[14px] leading-snug" style={{ color: 'hsl(var(--background) / 0.75)' }}>
              {erste?.titel ? `${erste.titel} · ` : ''}
              {anzahl} {anzahl === 1 ? 'Verbesserung' : 'Verbesserungen'}
              {namen.length > 0 && <> · einige davon aus euren Rückmeldungen – danke, {namen.join(', ')}!</>}
            </AlertDialogDescription>
          </div>
        </div>

        {/* Inhalt: scrollt, Kopf und Fuß bleiben stehen */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6" style={{ backgroundColor: RITTLER.surface }}>
          {erste && <NeuigkeitInhalt ausgabe={erste} variante="fenster" ohneKopf />}
          {weitere.map((a) => <NeuigkeitInhalt key={a.id} ausgabe={a} variante="fenster" />)}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t bg-background" style={{ borderColor: RITTLER.line }}>
          <p className="text-[12px] flex-1 min-w-[220px]" style={{ color: RITTLER.textSecondary }}>
            Zum Nachlesen: das Funkel-Symbol neben der Suche. Etwas fehlt oder hakt? Gleich daneben: Rückmeldung.
          </p>
          <button
            type="button"
            onClick={verstanden}
            disabled={speichert}
            className="h-10 px-6 text-[14px] font-semibold flex items-center gap-2 disabled:opacity-60 transition-transform hover:-translate-y-px"
            style={{ borderRadius: 3, backgroundColor: RITTLER.pink, color: 'hsl(var(--primary-foreground))' }}
          >
            {speichert && <Loader2 className="w-4 h-4 animate-spin" />}
            Los geht’s
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
