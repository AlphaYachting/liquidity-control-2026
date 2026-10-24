import React from 'react';
import { Sparkles } from 'lucide-react';
import { RITTLER } from '@/components/sprint/sprintConfig';
import NeuigkeitInhalt from './NeuigkeitInhalt';
import { tag } from '@/lib/neuigkeiten';

// Das Aussehen von „Was ist neu" — EINE Darstellung für das Begrüßungsfenster nach dem Update,
// das Archiv hinter dem Funkel-Symbol und die Vorschau auf der Verwaltungsseite.
// Titel und Beschreibung kommen als Bausteine des jeweiligen Dialogs herein (Barrierefreiheit).

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

// Klassen und Stil für den Dialog-Rahmen, in dem die Bühne steht
export const BUEHNE_RAHMEN = 'max-w-[580px] w-[calc(100vw-32px)] p-0 gap-0 overflow-hidden max-h-[88vh] flex flex-col';
export const BUEHNE_RAHMEN_STIL = { borderRadius: 6 };

// Wer hat etwas gewünscht? "John, Johannes" → zwei Personen
const wuenscher = (ausgaben) => [...new Set(ausgaben.flatMap((a) => (a.punkte || [])
  .flatMap((p) => String(p?.von || '').split(/,| und /).map((s) => s.trim()).filter(Boolean))))];

export default function NeuigkeitenBuehne({
  ausgaben = [], Titel, Beschreibung, titel = 'Was ist neu im Agency Manager', abzeichen = 'Update', fuss, leer,
}) {
  const erste = ausgaben[0];
  const weitere = ausgaben.slice(1);
  const anzahl = erste ? (erste.punkte || []).filter((p) => p?.text).length : 0;
  const namen = wuenscher(erste ? [erste] : []);

  return (
    <>
      <style>{ANIMATION}</style>
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
              {abzeichen}
            </span>
            {erste?.veroeffentlicht_am && (
              <span className="text-[12px] opacity-70">{tag(erste.veroeffentlicht_am)}</span>
            )}
          </div>
          <Titel className="mt-4 text-[26px] leading-[30px] font-bold tracking-tight text-left">
            {titel}
          </Titel>
          <Beschreibung className="mt-2 text-[14px] leading-snug text-left" style={{ color: 'hsl(var(--background) / 0.75)' }}>
            {erste ? (
              <>
                {erste.titel ? `${erste.titel} · ` : ''}
                {anzahl} {anzahl === 1 ? 'Verbesserung' : 'Verbesserungen'}
                {namen.length > 0 && <> · einige davon aus euren Rückmeldungen – danke, {namen.join(', ')}!</>}
              </>
            ) : 'Alle Neuerungen im Agency Manager'}
          </Beschreibung>
        </div>
      </div>

      {/* Inhalt: scrollt, Kopf und Fuß bleiben stehen */}
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6" style={{ backgroundColor: RITTLER.surface }}>
        {!erste && leer}
        {erste && <NeuigkeitInhalt ausgabe={erste} variante="fenster" ohneKopf />}
        {weitere.map((a) => <NeuigkeitInhalt key={a.id || a.titel} ausgabe={a} variante="fenster" />)}
      </div>

      {fuss && (
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t bg-background" style={{ borderColor: RITTLER.line }}>
          {fuss}
        </div>
      )}
    </>
  );
}

// Der pinke Hauptknopf im Fuß
export function BuehneKnopf({ children, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-10 px-6 text-[14px] font-semibold flex items-center gap-2 disabled:opacity-60 transition-transform hover:-translate-y-px"
      style={{ borderRadius: 3, backgroundColor: RITTLER.pink, color: 'hsl(var(--primary-foreground))' }}
    >
      {children}
    </button>
  );
}
