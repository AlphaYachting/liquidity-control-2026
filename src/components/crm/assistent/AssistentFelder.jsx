import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import ReplySlotFields from '@/components/crm/emails/ReplySlotFields';
import { betragLabel, dateLabel } from './assistentConfig';

const Titel = ({ children }) => (
  <p className="text-[11.5px] font-medium text-muted-foreground mb-1.5">{children}</p>
);

const AngebotsZeile = ({ angebot, gesendetAm, tage }) => (
  <div className="border border-border rounded-lg bg-muted/40 px-3.5 py-3">
    <p className="text-[13px] font-semibold truncate">{angebot?.titel || 'Angebot'}</p>
    <p className="text-xs text-muted-foreground tabular-nums">
      {betragLabel(angebot?.summe_netto)}
      {gesendetAm
        ? ` · übermittelt am ${dateLabel(gesendetAm)}${tage != null ? ` · vor ${tage} Tagen` : ''}`
        : ` · ${angebot?.hat_pdf ? 'PDF liegt vor' : 'kein PDF — Preise stehen in der Mail'}`}
    </p>
  </div>
);

// Felder der gewählten Absicht — höchstens ein optionales Feld sichtbar.
export default function AssistentFelder({ intent, felder, setFeld, angebot, gesendetAm, tage, disabled }) {
  return (
    <div className="mt-4">
      {intent === 'antwort' && (
        <>
          <Titel>Worauf soll die Antwort eingehen? — optional</Titel>
          <Textarea
            rows={2}
            disabled={disabled}
            value={felder.stichworte}
            onChange={(e) => setFeld('stichworte', e.target.value)}
            placeholder="z. B. Umsetzung bis Jahresende ist machbar"
            className="text-[13px] resize-y"
          />
        </>
      )}

      {intent === 'termin' && (
        <>
          <Titel>Termine — genannt wird nur, was hier steht</Titel>
          <ReplySlotFields
            slots={felder.slots}
            onSlotChange={(i, v) => setFeld('slots', felder.slots.map((s, idx) => (idx === i ? v : s)))}
            format={felder.format}
            onFormatChange={(v) => setFeld('format', v)}
            disabled={disabled}
          />
        </>
      )}

      {intent === 'angebot' && (
        <>
          <Titel>Angebot</Titel>
          <AngebotsZeile angebot={angebot} />
          {angebot?.hat_pdf && (
            <div className="flex items-center gap-2 mt-2.5">
              <Switch id="ass-pdf" checked={felder.pdf_link} onCheckedChange={(v) => setFeld('pdf_link', v)} disabled={disabled} />
              <Label htmlFor="ass-pdf" className="text-[13px]">PDF-Link in den Text einfügen</Label>
            </div>
          )}
        </>
      )}

      {intent === 'besprechung' && (
        <>
          <Titel>Angebot</Titel>
          <AngebotsZeile angebot={angebot} gesendetAm={gesendetAm} tage={tage} />
          <div className="mt-3">
            <Titel>Termine — genannt wird nur, was hier steht</Titel>
            <ReplySlotFields
              slots={felder.slots}
              onSlotChange={(i, v) => setFeld('slots', felder.slots.map((s, idx) => (idx === i ? v : s)))}
              format={felder.format}
              onFormatChange={(v) => setFeld('format', v)}
              disabled={disabled}
            />
          </div>
          <div className="mt-3">
            <Titel>Worauf besonders eingehen? — optional</Titel>
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

      {intent === 'absage' && (
        <>
          <Titel>Grund — wird höflich umformuliert</Titel>
          <Input
            value={felder.grund}
            disabled={disabled}
            onChange={(e) => setFeld('grund', e.target.value)}
            placeholder="z. B. unsere Kapazitäten im gewünschten Zeitraum sind verplant"
            className="h-9 text-[13px]"
          />
        </>
      )}
    </div>
  );
}