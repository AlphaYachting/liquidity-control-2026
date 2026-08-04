import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import { SIGNERS, OFFER_TYPES } from '@/components/crm/proposals/proposalConfig';

const CARDS = [
  {
    type: 'neukunde',
    title: 'A · Neukundenangebot',
    audience: 'Neukunde ohne Vorbeziehung, Pitch, mehrere Disziplinen, hohes Volumen, Bank-/Förderunterlage',
    result: 'PDF Langform (18–22 Seiten)',
    flow: '3 KI-Läufe · 2 Freigabestopps',
  },
  {
    type: 'bestand',
    title: 'B · Bestandskundenangebot',
    audience: 'Bestandskunde, Folgeauftrag, bekannter Kontext, klar umrissener Umfang',
    result: 'PDF Kurzform (8–11 Seiten)',
    flow: '2 KI-Läufe · 1 Freigabestopp',
  },
  {
    type: 'email',
    title: 'C · E-Mail-Angebot',
    audience: 'Bestandskunde, schnelle Rückmeldung ohne Dokument',
    result: 'Strukturierte E-Mail, 14 Tage gültig',
    flow: '1 KI-Lauf · 1 Freigabestopp',
  },
];

// Schritt 0 — Angebotstyp wählen und bestätigen. Ohne Bestätigung läuft kein KI-Lauf.
export default function OfferTypeSelector({ proposal, busy, onConfirmed }) {
  const [selected, setSelected] = useState(null);
  const [sprint, setSprint] = useState(proposal.sprint_mode || false);
  const [signedBy, setSignedBy] = useState(proposal.signed_by || SIGNERS[0]);
  const [saving, setSaving] = useState(false);

  const { data: ctx, isLoading } = useQuery({
    queryKey: ['offer-type-context', proposal.id],
    queryFn: async () => {
      const deal = proposal.deal_id
        ? await base44.entities.CrmDeal.get(proposal.deal_id).catch(() => null)
        : null;
      const customer = deal?.linked_customer_name || deal?.company_name || proposal.customer_company || '';
      let hasProjects = false, hasInvoices = false;
      if (customer) {
        const [lp, inv] = await Promise.all([
          base44.entities.LiquidityProject.filter({ customer }, '-updated_date', 1).catch(() => []),
          base44.entities.InvoiceRecord.filter({ customer_name: customer }, '-updated_date', 1).catch(() => []),
        ]);
        hasProjects = lp.length > 0;
        hasInvoices = inv.length > 0;
      }
      const settings = await base44.entities.Setting.filter({ key: 'email_offer_customers_only' }).catch(() => []);
      return {
        isBestandskunde: deal?.pipeline === 'existing_customer' || hasProjects || hasInvoices,
        emailForAll: settings[0]?.value === 'alle',
      };
    },
  });

  const isBestandskunde = ctx?.isBestandskunde || false;
  const emailAllowed = isBestandskunde || ctx?.emailForAll || false;
  const recommended = isBestandskunde ? 'bestand' : 'neukunde';
  const recommendReason = isBestandskunde
    ? 'Bestandskunde erkannt — bekannter Kontext, die Kurzform genügt.'
    : 'Kein bestehender Kundenkontext — Neukunden-Langform empfohlen.';
  const effective = selected || recommended;

  const confirm = async () => {
    setSaving(true);
    await base44.entities.CrmProposal.update(proposal.id, {
      offer_type: effective,
      mode: OFFER_TYPES[effective].mode,
      offer_type_reason: effective === recommended ? recommendReason : 'Manuell gewählt',
      type_confirmed_at: new Date().toISOString(),
      sprint_mode: effective === 'email' ? false : sprint,
      signed_by: signedBy,
    });
    setSaving(false);
    onConfirmed?.(effective);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {CARDS.map(card => {
          const disabled = card.type === 'email' && !emailAllowed;
          const isActive = effective === card.type && !disabled;
          const isRecommended = recommended === card.type;
          return (
            <button
              key={card.type}
              type="button"
              disabled={disabled || isLoading}
              onClick={() => setSelected(card.type)}
              className={`text-left border rounded-xl p-4 transition-all relative ${
                disabled ? 'opacity-60 cursor-not-allowed bg-muted/30' :
                isActive ? 'border-primary ring-2 ring-primary/30 bg-card shadow-md' : 'bg-card hover:shadow-md'
              }`}
            >
              {isRecommended && !disabled && (
                <span className="absolute -top-2 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
                  Empfohlen
                </span>
              )}
              <p className="font-semibold text-sm">{card.title}</p>
              <p className="text-xs text-muted-foreground mt-2">{card.audience}</p>
              <div className="mt-3 space-y-1 text-xs">
                <p className="font-medium">{card.result}</p>
                <p className="text-muted-foreground">{card.flow}</p>
              </div>
              {disabled && (
                <p className="text-[11px] text-amber-700 mt-2 font-medium">
                  Nur für Bestandskunden — für Neukunden bitte A oder B.
                </p>
              )}
              {isActive && <CheckCircle2 className="w-4 h-4 text-primary absolute bottom-3 right-3" />}
            </button>
          );
        })}
      </div>

      {!isLoading && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Empfehlung:</span> {recommendReason}
        </p>
      )}

      <div className="border rounded-xl bg-card p-4 flex items-end justify-between gap-4 flex-wrap">
        <div className="flex items-end gap-6 flex-wrap">
          <div>
            <Label className="text-xs">Signatur</Label>
            <Select value={signedBy} onValueChange={setSignedBy}>
              <SelectTrigger className="mt-1 h-9 w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SIGNERS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {effective !== 'email' && (
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={sprint} onCheckedChange={setSprint} id="type-sprint" />
              <Label htmlFor="type-sprint" className="text-xs">Sprint (fester Liefertermin)</Label>
            </div>
          )}
        </div>
        <Button onClick={confirm} disabled={saving || busy || isLoading || (effective === 'email' && !emailAllowed)} className="gap-2">
          {saving || busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Typ bestätigen & starten
        </Button>
      </div>
    </div>
  );
}