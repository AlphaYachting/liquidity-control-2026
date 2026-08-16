import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ClipboardCheck } from 'lucide-react';
import { PIPELINES } from '@/components/crm/stages';
import { computeAbPflicht } from '@/lib/crm/abPflicht';
import { proposalPositions, guessProjectType } from '@/lib/crm/proposalPositions';
import { commitHandover } from '@/lib/crm/handoverCommit';
import ClientLinkStep from '@/components/crm/handover/ClientLinkStep';

const eur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

const PROJEKTTYPEN = [
  { key: 'sprint', label: 'Sprint (fester Liefertermin)' },
  { key: 'support', label: 'Support (Kontingent)' },
  { key: 'container', label: 'Container (laufend)' },
  { key: 'aufwand', label: 'Regie / nach Aufwand' },
  { key: 'paket', label: 'Paket' },
];

// Übergabeblatt: Angebot → Auftrag. Vor „Freigeben & anlegen" wird nichts gespeichert.
export default function UebergabeblattSection({ deal, onDone, onCancel }) {
  const navigate = useNavigate();
  const [advance, setAdvance] = useState(30);
  const [projectType, setProjectType] = useState(null);
  const [pm, setPm] = useState('');
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState(null);
  const kunde = deal.linked_customer_name || deal.company_name || '';

  const { data, isLoading } = useQuery({
    queryKey: ['uebergabe-kontext', deal.id],
    queryFn: async () => {
      const [proposal, orders, team, modules] = await Promise.all([
        deal.proposal_id ? base44.entities.CrmProposal.get(deal.proposal_id).catch(() => null) : Promise.resolve(null),
        kunde ? base44.entities.ConfirmedOrder.filter({ customer: kunde }, '-created_date', 5) : Promise.resolve([]),
        base44.entities.TeamMember.filter({ active: true }, 'name', 100),
        base44.entities.ModuleTemplate.list('-created_date', 200),
      ]);
      return { proposal, hasPreviousOrders: (orders || []).length > 0, team: team || [], modules: modules || [] };
    },
  });

  const positions = useMemo(() => proposalPositions(data?.proposal), [data?.proposal]);
  const positionsTotal = positions.reduce((s, p) => s + (p.amount || 0), 0);
  const total = positionsTotal > 0 ? positionsTotal : Number(deal.value_net) || 0;
  const ab = data ? computeAbPflicht({ deal, proposal: data.proposal, hasPreviousOrders: data.hasPreviousOrders }) : null;
  // Ohne AB-Pflicht läuft die Abrechnung auf Regie — dann auch keine Anzahlung
  const regie = ab ? ab.regie === true : false;
  const typ = projectType || (regie ? 'aufwand' : (data ? guessProjectType(data.proposal, positions, data.modules) : 'paket'));
  const advancePercent = regie ? 0 : Number(advance) || 0;
  const advanceAmount = Math.round(advancePercent / 100 * total);

  const freigeben = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      const { wizardState } = await commitHandover({
        deal, kunde: client.name, clientId: client.id, positions, total,
        advancePercent: advancePercent,
        projectType: typ,
        pm,
        abRequired: ab.required,
        modules: data?.modules || [],
      });
      await base44.entities.CrmDeal.update(deal.id, {
        stage: PIPELINES[deal.pipeline]?.wonStage,
        closed_at: now.split('T')[0],
      });
      await base44.entities.CrmActivity.create({
        deal_id: deal.id,
        activity_type: 'stage_change',
        title: 'Beauftragt',
        content: regie
          ? `Auftrag angelegt · ${eur(total)} · ohne AB, Abrechnung auf Regie · PM ${pm || '—'} — ${ab.reason}`
          : `Auftrag angelegt · ${eur(total)} · Anzahlung ${advancePercent} % (${eur(advanceAmount)}) · PM ${pm || '—'} — ${ab.reason}`,
        activity_date: now,
      });
      onDone?.();
      // Projekt entsteht im bestehenden Anlage-Wizard, vorbefüllt aus dem Angebot
      navigate('/sprint/neu', { state: wizardState });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-2 border-primary/30 rounded-xl bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Übergabeblatt · Beauftragung</h2>
        {ab && (
          <Badge variant="outline" className={`text-[10px] border-0 ${ab.required ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-secondary-foreground'}`}>
            AB-Pflicht: {ab.required ? 'ja' : 'nein'}
          </Badge>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Angebot wird gelesen…</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">{ab?.reason}</p>

          <ClientLinkStep deal={deal} kunde={kunde} client={client} onClient={setClient} />

          <div className="rounded-lg border overflow-hidden">
            <div className="px-3 py-2 bg-muted/50 border-b">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Auftragspositionen</p>
            </div>
            {positions.length === 0 ? (
              <p className="px-3 py-2 text-xs text-muted-foreground">Keine Angebots-Module gefunden — Gesamtbetrag aus dem Deal übernommen.</p>
            ) : (
              positions.map((p, i) => (
                <div key={i} className="px-3 py-2 flex items-center justify-between gap-3 border-b last:border-b-0">
                  <span className="text-sm truncate">{p.name}{p.optional ? ' (optional)' : ''}</span>
                  <span className="text-sm tabular-nums">{eur(p.amount)}</span>
                </div>
              ))
            )}
            <div className="px-3 py-2 flex items-center justify-between bg-muted/30 border-t">
              <span className="text-sm font-semibold">Projekthöhe netto</span>
              <span className="text-sm font-bold tabular-nums">{eur(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Projekttyp</Label>
              <Select value={typ} onValueChange={setProjectType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJEKTTYPEN.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Verantwortlicher PM</Label>
              <Select value={pm} onValueChange={setPm}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Person wählen" /></SelectTrigger>
                <SelectContent>
                  {(data?.team || []).map((m) => <SelectItem key={m.email} value={m.email}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {regie ? (
              <div className="sm:col-span-2">
                <Label className="text-xs">Anzahlung</Label>
                <p className="h-9 flex items-center text-sm text-muted-foreground">
                  Keine Anzahlung — Abrechnung läuft auf Regie nach Aufwand.
                </p>
              </div>
            ) : (
              <>
                <div>
                  <Label className="text-xs">Anzahlung %</Label>
                  <Input type="number" min="0" max="100" value={advance} onChange={(e) => setAdvance(e.target.value)} className="h-9" />
                </div>
                <div>
                  <Label className="text-xs">Anzahlungsbetrag</Label>
                  <p className="h-9 flex items-center text-sm font-semibold tabular-nums">{eur(advanceAmount)}</p>
                </div>
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={onCancel}>Abbrechen</Button>
            <Button onClick={freigeben} disabled={saving || !ab || !client?.sevdesk_contact_id}>
              {saving ? 'Wird angelegt…' : 'Freigeben & anlegen'}

            </Button>
          </div>
        </>
      )}
    </div>
  );
}