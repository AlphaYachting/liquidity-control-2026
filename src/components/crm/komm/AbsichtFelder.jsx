import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus } from 'lucide-react';
import ReplySlotFields from '@/components/crm/emails/ReplySlotFields';
import FeldTitel from './FeldTitel';
import AngebotsZeile from './AngebotsZeile';

// Die Felder der gewählten Absicht — nichts klappt auf, die Karte wächst mit dem Vorgang.
export default function AbsichtFelder({ intent, felder, setFeld, angebot, angebotGesendetAm, angebotTage, disabled }) {
  return (
    <div className="mt-4 pt-4 border-t border-dashed border-border">
      {intent === 'terminvorschlag' && (
        <>
          <FeldTitel>Terminvorschläge — es werden nur Termine genannt, die hier stehen</FeldTitel>
          <ReplySlotFields
            slots={felder.slots}
            onSlotChange={(i, v) => setFeld('slots', felder.slots.map((s, idx) => (idx === i ? v : s)))}
            format={felder.format}
            onFormatChange={(v) => setFeld('format', v)}
            disabled={disabled}
          />
        </>
      )}

      {intent === 'antwort' && (
        <>
          <FeldTitel>Worauf soll die Antwort eingehen? (optional)</FeldTitel>
          <Textarea
            rows={2}
            disabled={disabled}
            value={felder.stichworte}
            onChange={(e) => setFeld('stichworte', e.target.value)}
            placeholder="z. B. Umsetzung bis Jahresende ist machbar, Konfigurator als zweite Ausbaustufe"
            className="text-[13px] resize-y"
          />
        </>
      )}

      {intent === 'angebot' && (
        <>
          <FeldTitel>Angebot</FeldTitel>
          <AngebotsZeile angebot={angebot} />
          {angebot?.hat_pdf ? (
            <div className="flex items-center gap-2 mt-2.5">
              <Switch id="komm-pdf-link" checked={felder.pdf_link} onCheckedChange={(v) => setFeld('pdf_link', v)} disabled={disabled} />
              <Label htmlFor="komm-pdf-link" className="text-[13px]">PDF-Link in den Text einfügen</Label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-2.5">
              Ohne PDF trägt die E-Mail das Angebot selbst — Positionen und Preise kommen aus dem
              freigegebenen Mapping, nicht aus der KI.
            </p>
          )}
        </>
      )}

      {intent === 'nachfassen' && (
        <>
          <FeldTitel>Bezug</FeldTitel>
          <AngebotsZeile angebot={angebot} gesendetAm={angebotGesendetAm} tage={angebotTage} />
          <div className="mt-3">
            <FeldTitel>Worauf besonders eingehen? (optional)</FeldTitel>
            <Textarea
              rows={2}
              disabled={disabled}
              value={felder.schwerpunkt}
              onChange={(e) => setFeld('schwerpunkt', e.target.value)}
              className="text-[13px] resize-y"
            />
          </div>
        </>
      )}

      {intent === 'rueckfrage' && (
        <>
          <FeldTitel>Offene Punkte</FeldTitel>
          <div className="space-y-2">
            {felder.punkte.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground w-4 tabular-nums shrink-0">{i + 1}.</span>
                <Input
                  value={p}
                  disabled={disabled}
                  onChange={(e) => setFeld('punkte', felder.punkte.map((x, idx) => (idx === i ? e.target.value : x)))}
                  placeholder="z. B. Wie viele Produktvarianten soll der Konfigurator abbilden?"
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => setFeld('punkte', [...felder.punkte, ''])}
            className="mt-2 gap-1.5"
          >
            <Plus className="w-[14px] h-[14px]" /> Punkt hinzufügen
          </Button>
        </>
      )}

      {intent === 'absage' && (
        <>
          <FeldTitel>Grund (wird höflich umformuliert)</FeldTitel>
          <Input
            value={felder.grund}
            disabled={disabled}
            onChange={(e) => setFeld('grund', e.target.value)}
            placeholder="z. B. unsere Kapazitäten im gewünschten Zeitraum sind bereits verplant"
            className="h-9 text-[13px]"
          />
        </>
      )}
    </div>
  );
}