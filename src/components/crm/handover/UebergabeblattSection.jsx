import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, ClipboardCheck } from 'lucide-react';
import { PIPELINES } from '@/components/crm/stages';
import { computeAbPflicht } from '@/lib/crm/abPflicht';
import { guessProjectType } from '@/lib/crm/proposalPositions';
import { bestimmeAngebot, startZustand, externesAngebot } from '@/lib/crm/angebotsUmfang';
import { commitHandover, suggestModuleId } from '@/lib/crm/handoverCommit';
import { threadTranscript } from '@/components/crm/support/threadDescription';
import useUebergabeKontext from '@/hooks/useUebergabeKontext';
import ClientLinkStep from '@/components/crm/handover/ClientLinkStep';
import ExternesAngebotLeser from '@/components/crm/handover/ExternesAngebotLeser';
import VereinbarterUmfang from '@/components/crm/handover/VereinbarterUmfang';
import AngebotsGrundlage from '@/components/crm/handover/AngebotsGrundlage';
import BestehenderAuftrag from '@/components/crm/handover/BestehenderAuftrag';
import { NO_MODULE } from '@/components/crm/handover/PositionModuleSelect';

const eur = (v) => new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);

const PROJEKTTYPEN = [
  { key: 'sprint', label: 'Sprint (fester Liefertermin)' },
  { key: 'container', label: 'Retainer (laufende Betreuung)' },
  { key: 'support', label: 'Support (technisch, laufend)' },
  { key: 'regie', label: 'Regie (nach Aufwand, ohne Angebot)' },
  { key: 'intern', label: 'Intern' },
];

// Übergabeblatt: Angebot → Auftrag. Vor „Freigeben & anlegen" wird nichts gespeichert.
export default function UebergabeblattSection({ deal, onDone, onCancel }) {
  const navigate = useNavigate();
  const [advance, setAdvance] = useState(30);
  const [projectType, setProjectType] = useState(null);
  const [pm, setPm] = useState('');
  const [saving, setSaving] = useState(false);
  const [client, setClient] = useState(null);
  const [belegFehler, setBelegFehler] = useState(null);
  const [angebot, setAngebot] = useState(null);
  const [zustand, setZustand] = useState(null);
  const [geprueft, setGeprueft] = useState(false);
  const kunde = deal.linked_customer_name || deal.company_name || '';

  const { data, isLoading } = useUebergabeKontext(deal, kunde);
  const modules = data?.modules || [];

  const uebernehmen = (a) => {
    const z = startZustand(a);
    z.positionen = z.positionen.map((p) => ({ ...p, module_choice: suggestModuleId(p.name, modules) || '' }));
    setAngebot(a);
    setZustand(z);
    setGeprueft(false);
  };

  useEffect(() => {
    if (data && !angebot) uebernehmen(bestimmeAngebot({ deal, proposal: data.proposal, config: data.config, quote: data.quote }));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const beauftragt = (zustand?.positionen || []).filter((p) => p.beauftragt);
  const positions = beauftragt.filter((p) => p.name.trim()).map((p) => ({
    ...p,
    name: p.name.trim(),
    amount: Number(p.amount) || 0,
    lieferumfang: (p.lieferumfang || []).map((s) => s.trim()).filter(Boolean),
    module_template_id: p.module_choice === NO_MODULE ? '' : p.module_choice,
  }));
  const summeVon = (art) => positions.filter((p) => p.abrechnung === art).reduce((s, p) => s + p.amount, 0);
  const summen = { einmalig: summeVon('einmalig'), monatlich: summeVon('monatlich'), aufwand: summeVon('nach_aufwand') };
  const total = summen.einmalig;
  const summeAlle = positions.reduce((s, p) => s + p.amount, 0);
  const alleAngehakt = (zustand?.positionen.length || 0) > 0 && beauftragt.length === zustand.positionen.length;
  const abweichung = angebot?.summe > 0 && alleAngehakt && Math.abs(summeAlle - angebot.summe) > 1
    ? { positionen: summeAlle, angebot: angebot.summe } : null;
  const positionenOk = positions.length > 0 && positions.length === beauftragt.length
    && positions.every((p) => p.description.trim() && p.module_choice);

  const ab = data ? computeAbPflicht({ deal, proposal: data.proposal, hasPreviousOrders: data.hasPreviousOrders }) : null;
  // Ohne AB-Pflicht läuft die Abrechnung auf Regie — dann auch keine Anzahlung
  const regie = ab ? ab.regie === true : false;
  const typ = projectType || (regie ? 'regie' : (data ? guessProjectType(data.proposal, positions, data.modules) : 'sprint'));
  const advancePercent = regie ? 0 : Number(advance) || 0;
  const advanceAmount = Math.round(advancePercent / 100 * total);

  const auftragUmfang = async () => {
    const a = zustand.auftrag;
    const me = await base44.auth.me().catch(() => null);
    return {
      angebot_quelle: angebot.quelle,
      ...(angebot.url ? { angebot_url: angebot.url } : {}),
      ...(angebot.nummer ? { angebot_nummer: angebot.nummer } : {}),
      ...(angebot.datum ? { angebot_datum: angebot.datum } : {}),
      ...(a.leistungszeitraum.trim() ? { leistungszeitraum: a.leistungszeitraum.trim() } : {}),
      ...(a.liefertermin ? { liefertermin: a.liefertermin } : {}),
      ...(a.korrekturschleifen !== '' ? { korrekturschleifen: Number(a.korrekturschleifen) } : {}),
      mehrkosten_regel: a.mehrkosten_regel.trim(),
      nicht_enthalten: (a.nicht_enthalten || []).map((s) => s.trim()).filter(Boolean),
      ...(a.zahlungsbedingungen ? { payment_terms: a.zahlungsbedingungen } : {}),
      umfang_geprueft_von: me?.email || '',
      umfang_geprueft_am: new Date().toISOString(),
    };
  };

  const freigeben = async () => {
    setSaving(true);
    try {
      const now = new Date().toISOString();
      // Verlauf und Anfragetext als Projektkontext mitgeben
      const transcript = deal.email_thread_id ? await threadTranscript(deal.email_thread_id).catch(() => '') : '';
      const contextText = [deal.description, transcript].filter(Boolean).join('\n\n---\n\n');
      const { wizardState, sevdeskFehler } = await commitHandover({
        deal, kunde: client.name, clientId: client.id, sevdeskContactId: client.sevdesk_contact_id,
        positions, total,
        auftragUmfang: await auftragUmfang(),
        client,
        emailQuote: data?.quote,
        advancePercent: advancePercent,
        projectType: typ,
        pm,
        abRequired: ab.required,
        modules,
        contextText,
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
      if (sevdeskFehler) {
        // Auftrag steht, der Beleg fehlt — das wird benannt statt stillschweigend übergangen
        setBelegFehler({ text: sevdeskFehler, wizardState });
        return;
      }
      onDone?.();
      // Projekt entsteht im bestehenden Anlage-Wizard, vorbefüllt aus dem Angebot
      navigate('/sprint/neu', { state: wizardState });
    } finally {
      setSaving(false);
    }
  };

  if (data?.bestehenderAuftrag && !belegFehler) {
    return <BestehenderAuftrag order={data.bestehenderAuftrag} deal={deal} onCancel={onCancel} />;
  }

  return (
    <div className="border rounded-lg bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <ClipboardCheck className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-semibold">Übergabeblatt · Beauftragung</h2>
        {ab && (
          <Badge variant="outline" className={`text-[10px] border-0 ${ab.required ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-secondary-foreground'}`}>
            AB-Pflicht: {ab.required ? 'ja' : 'nein'}
          </Badge>
        )}
      </div>

      {isLoading || !zustand ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Angebot wird gelesen…</p>
      ) : (
        <>
          <AngebotsGrundlage angebot={angebot} />
          <p className="text-xs text-muted-foreground">{ab?.reason}</p>

          <ClientLinkStep deal={deal} kunde={kunde} client={client} onClient={setClient} />

          {(angebot.quelle === 'extern_pdf' || angebot.quelle === 'manuell') && (
            <ExternesAngebotLeser deal={deal} onGelesen={(json, url) => uebernehmen(externesAngebot(json, url))} />
          )}

          <VereinbarterUmfang
            zustand={zustand} onChange={setZustand} modules={modules} summen={summen}
            abweichung={abweichung} geprueft={geprueft} onGeprueft={setGeprueft}
            manuell={angebot.quelle === 'manuell' || angebot.quelle === 'extern_pdf'}
          />
          {beauftragt.length > 0 && !positionenOk && (
            <p className="text-xs text-status-attention">Jede angehakte Position braucht Name, Beschreibung und Modulwahl.</p>
          )}

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

          {belegFehler && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
              <p className="text-xs text-amber-800">
                Auftrag und Kunde stehen, aber in sevDesk entstand kein Beleg: {belegFehler.text}.
                Angebot und Auftragsbestätigung bitte in sevDesk prüfen.
              </p>
              <Button size="sm" className="h-8 text-xs" onClick={() => { onDone?.(); navigate('/sprint/neu', { state: belegFehler.wizardState }); }}>
                Weiter zum Projekt anlegen
              </Button>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t pt-3">
            <Button variant="outline" onClick={onCancel}>Abbrechen</Button>
            <Button onClick={freigeben} disabled={saving || !!belegFehler || !ab || !client?.sevdesk_contact_id || !positionenOk || (abweichung && !geprueft)}>
              {saving ? 'Wird angelegt…' : 'Freigeben & anlegen'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}