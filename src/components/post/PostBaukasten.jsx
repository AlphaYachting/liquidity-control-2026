import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight, MoreHorizontal, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { TON_STREIFEN } from '@/lib/designTon';

// ============================================================================================
// POST-BAUKASTEN (22.10.2026): EINE Optik für alle Postbereiche — Posteingang, Support-Eingang,
// Kunden-Eskalationen, „Meine Post“ und E-Mail-Zentrale. Jeder Bereich setzt sich aus denselben
// drei Teilen zusammen: PostZeile (zugeklappt), PostAktionen (eine Leiste), PostAbschnitt.
// ============================================================================================

export const POST_RASTER = 'grid grid-cols-[36px_minmax(0,1fr)_220px_170px_16px] gap-3.5 items-center';

/**
 * Eine Zeile — zugeklappt immer gleich aufgebaut:
 *  Symbol | Betreff + Absender/Kunde | Einordnung + Beleg | Datum, Stand, Zuständig | Pfeil
 * Aufgeklappt folgt der Inhalt (children) in einheitlichem Abstand.
 */
export function PostZeile({
  symbol, ton, titel, vorTitel, unterzeile, einordnung, einordnungTon, einordnungZeile2,
  datum, stand, standTon, standWartet, zustaendig, offen, onOeffnen, children,
}) {
  return (
    <div className={cn(ton === 'critical' ? TON_STREIFEN.critical : ton === 'attention' && TON_STREIFEN.attention)}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={offen}
        onClick={onOeffnen}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOeffnen?.(); } }}
        className={cn(POST_RASTER, 'px-4 py-3 cursor-pointer hover:bg-muted/40', offen && 'bg-muted/30')}
      >
        <span className="w-8 h-8 rounded-lg bg-muted grid place-items-center text-foreground/70">{symbol}</span>

        <div className="min-w-0">
          <p className="text-object text-foreground truncate">{vorTitel}{titel || 'Ohne Betreff'}</p>
          {unterzeile && <p className="text-label uppercase text-muted-foreground truncate">{unterzeile}</p>}
        </div>

        <div className="min-w-0">
          {einordnung && (
            <p className={cn('text-[12px] font-semibold uppercase tracking-[0.04em] truncate',
              einordnungTon === 'critical' ? 'text-status-critical' : 'text-muted-foreground')}>
              {einordnung}
            </p>
          )}
          {einordnungZeile2 && <p className="text-meta text-muted-foreground truncate" title={typeof einordnungZeile2 === 'string' ? einordnungZeile2 : undefined}>{einordnungZeile2}</p>}
        </div>

        <div className="text-right min-w-0">
          {datum && <p className="text-meta text-muted-foreground">{datum}</p>}
          {stand && (
            <p className={cn('text-meta truncate', standTon === 'critical' ? 'font-semibold text-status-critical' : 'text-muted-foreground')}>
              {standWartet && <Clock className="inline w-3 h-3 mr-1 -mt-0.5" />}{stand}
            </p>
          )}
          {zustaendig}
        </div>

        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', offen && 'rotate-180')} />
      </div>

      {offen && <div className="border-t px-4 pt-3 pb-4 pl-[66px] space-y-3">{children}</div>}
    </div>
  );
}

/**
 * EINE Aktionsleiste. Reihenfolge überall gleich:
 *  links die Hauptaktionen (die empfohlene ist gefüllt), dann „Mehr“, rechts die Zuständigkeit.
 *  aktionen: [{ key, label, icon, onClick | href, primaer, disabled }]
 *  mehr:     [{ key, label, icon, onClick, trenner }]
 */
export function PostAktionen({ aktionen = [], mehr = [], rechts, busy }) {
  const sichtbar = aktionen.filter(Boolean);
  const mehrSichtbar = mehr.filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {sichtbar.map((a) => {
        const Icon = a.icon;
        const inhalt = <>{Icon && <Icon />}{a.label}</>;
        const variant = a.primaer ? 'default' : 'outline';
        return a.href ? (
          <Button key={a.key} size="sm" variant={variant} asChild disabled={busy || a.disabled}>
            <Link to={a.href}>{inhalt}</Link>
          </Button>
        ) : (
          <Button key={a.key} size="sm" variant={variant} disabled={busy || a.disabled} onClick={a.onClick}>{inhalt}</Button>
        );
      })}
      {mehrSichtbar.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="ghost" disabled={busy}><MoreHorizontal /> Mehr</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {mehrSichtbar.map((m) => {
              const Icon = m.icon;
              return (
                <React.Fragment key={m.key}>
                  {m.trenner && <DropdownMenuSeparator />}
                  <DropdownMenuItem onClick={m.onClick} disabled={m.disabled}>
                    {Icon && <Icon className="w-4 h-4 mr-2" />}{m.label}
                  </DropdownMenuItem>
                </React.Fragment>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <span className="flex-1" />
      {rechts}
    </div>
  );
}

/** Abschnitt im aufgeklappten Bereich — gleiche Überschrift überall, optional einklappbar. */
export function PostAbschnitt({ titel, zusatz, klappbar = false, startOffen = true, children }) {
  const [offen, setOffen] = useState(startOffen);
  const Icon = offen ? ChevronDown : ChevronRight;
  const kopf = (
    <span className="flex items-center gap-2 text-label uppercase text-muted-foreground">
      {klappbar && <Icon className="w-3.5 h-3.5" />}
      {titel}
      {zusatz && <span className="normal-case tracking-normal text-meta">· {zusatz}</span>}
    </span>
  );
  return (
    <div className="space-y-2">
      {klappbar
        ? <button type="button" className="text-left" onClick={() => setOffen((o) => !o)}>{kopf}</button>
        : kopf}
      {(!klappbar || offen) && children}
    </div>
  );
}

export const postDatum = (ms) => (ms
  ? new Date(ms).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '');
