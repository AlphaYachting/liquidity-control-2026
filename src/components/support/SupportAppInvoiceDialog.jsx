import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supportVerrechnungsMinuten } from '@/lib/zeit/rundung';

// Rechnung aus erledigten App-Tickets: je Ticket eine Position mit Leistungsbeschreibung aus dem Ticket.
// Stunden: gebuchte Zeit nach Support-Regel (Minimum 0,5 h, danach 15-Minuten-Schritte);
// ohne gebuchte Zeit von Hand einzutragen (ebenfalls auf 0,25 aufgerundet, Minimum 0,5).
const datum = (d) => (d ? new Date(d).toLocaleDateString('de-AT') : '—');
const ausGebucht = (min) => supportVerrechnungsMinuten(min) / 60;
const regel = (h) => {
  const n = Number(String(h).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0.5, Math.ceil(n * 4) / 4);
};

export default function SupportAppInvoiceDialog({ row, open, onOpenChange, onDone }) {
  const [rate, setRate] = useState(row.stundensatz || 130);
  const [selected, setSelected] = useState(() => row.tasks.map((t) => t.key));
  const [stunden, setStunden] = useState(() => Object.fromEntries(row.tasks.map((t) => [t.key, t.open_minutes > 0 ? String(ausGebucht(t.open_minutes)) : ''])));
  const [texte, setTexte] = useState(() => Object.fromEntries(row.tasks.map((t) => [t.key, t.ticket_id ? '' : 'Supportleistungen ohne Ticketzuordnung'])));
  const [laedtTexte, setLaedtTexte] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState('');

  // Leistungsbeschreibung aus den Tickets vorschlagen
  useEffect(() => {
    const ids = row.tasks.map((t) => t.ticket_id).filter(Boolean);
    if (!open || !ids.length) return;
    let abgebrochen = false;
    setLaedtTexte(true);
    base44.functions.invoke('supportVerrechnung', { aktion: 'leistungstext', ticket_ids: ids })
      .then((res) => {
        if (abgebrochen) return;
        const vorschlag = res.data?.texte || {};
        setTexte((alt) => {
          const neu = { ...alt };
          for (const t of row.tasks) {
            if (t.ticket_id && !alt[t.key]) neu[t.key] = vorschlag[t.ticket_id] || t.task_title;
          }
          return neu;
        });
      })
      .catch(() => {
        if (abgebrochen) return;
        setTexte((alt) => {
          const neu = { ...alt };
          for (const t of row.tasks) if (t.ticket_id && !alt[t.key]) neu[t.key] = t.task_title;
          return neu;
        });
      })
      .finally(() => { if (!abgebrochen) setLaedtTexte(false); });
    return () => { abgebrochen = true; };
  }, [open]);

  const gewaehlt = row.tasks.filter((t) => selected.includes(t.key));
  const positionen = gewaehlt.map((t) => {
    const menge = regel(stunden[t.key]);
    const leistung = String(texte[t.key] || '').trim();
    const fusszeile = [t.erledigt_am ? `erledigt am ${datum(t.erledigt_am)}` : (t.last_entry_date ? `geleistet am ${datum(t.last_entry_date)}` : ''), t.assignee_name].filter(Boolean).join(' · ');
    return {
      key: t.key,
      ticket_id: t.ticket_id || null,
      name: t.task_title,
      leistung,
      text: [leistung, fusszeile].filter(Boolean).join('\n'),
      quantity: menge,
      price: Number(rate || 0),
    };
  });
  const fehlendeStunden = positionen.filter((p) => p.quantity <= 0).length;
  const fehlendeTexte = positionen.filter((p) => !p.leistung).length;
  const summeStunden = positionen.reduce((s, p) => s + p.quantity, 0);
  const netto = Math.round(summeStunden * Number(rate || 0) * 100) / 100;
  const kundeOk = Boolean(row.sevdesk_contact_id);
  const bereit = kundeOk && positionen.length > 0 && !fehlendeStunden && !fehlendeTexte && netto > 0 && !laedtTexte;

  const anlegen = async () => {
    setBusy(true);
    setFehler('');
    try {
      const header = positionen.length === 1
        ? `Verrechnung Supportauftrag: ${positionen[0].name}`
        : `Verrechnung Supportauftrag: ${positionen.map((p) => p.name).join(', ')}`;
      const mitVorleistung = gewaehlt.filter((t) => t.vorleistung_minutes > 0 && t.ticket_id);
      const instr = await base44.entities.BillingInstruction.create({
        project_id: row.liquidity_project_id || '',
        customer_name: row.customer_name,
        project_name: row.project_name,
        instruction_type: 'manual_amount',
        invoice_type: 'partial_invoice',
        status: 'ready_for_backoffice',
        instruction_amount_net: netto,
        invoice_reason: positionen.length === 1
          ? `Verrechnung Supportauftrag: ${positionen[0].name} (${summeStunden.toFixed(2)} h)`
          : `Verrechnung Supportauftrag — ${positionen.length} Anfragen, ${summeStunden.toFixed(2)} h`,
        internal_note: `Support-Abrechnung aus Agency-Manager-Tickets (Status erledigt) — ${positionen.length} Positionen à ${rate} €/h, Minimum 0,5 h, danach in 15-Minuten-Schritten aufgerundet`,
        source_snapshot_json: JSON.stringify({
          quelle: 'app',
          client_id: row.client_id,
          project_id: row.tasks[0]?.project_id || null,
          support_ticket_ids: gewaehlt.filter((t) => t.ticket_id).map((t) => t.ticket_id),
          time_entry_ids: gewaehlt.flatMap((t) => t.time_entry_ids || []),
          vorleistung_ticket_ids: mitVorleistung.map((t) => t.ticket_id),
          awork_vorleistung_task_ids: mitVorleistung.map((t) => t.awork_task_id).filter(Boolean),
          sevdesk_contact_id: row.sevdesk_contact_id || null,
          invoice_header: header,
          hourly_rate: Number(rate),
          hours: summeStunden,
          invoice_positions: positionen,
        }),
      });
      const res = await base44.functions.invoke('createSevdeskInvoiceDraft', {
        billing_instruction_id: instr.id,
        set_status_invoice_created: true,
      });
      if (res.data?.error) throw new Error(res.data.error);
      const mark = await base44.functions.invoke('supportAbrechnungMarkieren', { aktion: 'markieren', billing_instruction_id: instr.id });
      if (mark.data?.error) throw new Error(mark.data.error);
      onDone();
      onOpenChange(false);
    } catch (e) {
      setFehler(e?.response?.data?.error || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle>Rechnung anlegen — {row.customer_name || row.project_name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Jedes Ticket wird eine eigene Rechnungsposition. Die Leistungsbeschreibung steht so auf der Rechnung — bitte prüfen.
            Stunden: Minimum 0,5 h, danach in 15-Minuten-Schritten aufgerundet.
          </p>

          <div className="space-y-3">
            {row.tasks.map((t) => {
              const aktiv = selected.includes(t.key);
              const menge = regel(stunden[t.key]);
              const leer = aktiv && menge <= 0;
              return (
                <div key={t.key} className={`border rounded-lg p-3 space-y-2 ${aktiv ? '' : 'opacity-60'}`}>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={aktiv}
                      onCheckedChange={(c) => setSelected((s) => (c ? [...s, t.key] : s.filter((x) => x !== t.key)))}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{t.task_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {[t.assignee_name, t.erledigt_am ? `erledigt ${datum(t.erledigt_am)}` : null, t.open_minutes > 0 ? `gebucht ${(t.open_minutes / 60).toFixed(2)} h` : 'keine Zeit gebucht', t.vorleistung_minutes > 0 ? `davon aWork ${(t.vorleistung_minutes / 60).toFixed(2)} h` : null].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="w-24 flex-shrink-0">
                      <Label className="text-xs">Stunden</Label>
                      <Input
                        type="number"
                        step="0.25"
                        min="0"
                        value={stunden[t.key]}
                        onChange={(e) => setStunden((s) => ({ ...s, [t.key]: e.target.value }))}
                        className={leer ? 'border-red-500' : ''}
                        disabled={!aktiv}
                      />
                    </div>
                    <div className="w-24 flex-shrink-0 text-right">
                      <Label className="text-xs">Betrag</Label>
                      <div className="h-9 flex items-center justify-end text-sm font-medium">
                        {(menge * Number(rate || 0)).toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
                      </div>
                    </div>
                  </div>
                  {leer && (
                    <p className="text-xs text-red-600 ml-7">
                      Keine Zeit gebucht — bitte Stunden eintragen{t.target_hours ? ` (Plan: ${t.target_hours} h)` : ''}.
                    </p>
                  )}
                  <div className="ml-7">
                    <Label className="text-xs">Leistungsbeschreibung (erscheint auf der Rechnung)</Label>
                    <Textarea
                      rows={2}
                      value={texte[t.key] || ''}
                      placeholder={laedtTexte ? 'Vorschlag wird aus dem Ticket erstellt …' : 'Was wurde erledigt?'}
                      onChange={(e) => setTexte((s) => ({ ...s, [t.key]: e.target.value }))}
                      disabled={!aktiv}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Stundensatz netto</Label>
              <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Positionen / Stunden</Label>
              <div className="h-9 flex items-center text-sm">{positionen.length} · {summeStunden.toFixed(2)} h</div>
            </div>
            <div>
              <Label className="text-xs">Rechnungsbetrag netto</Label>
              <div className="h-9 flex items-center font-semibold">
                {netto.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' })}
              </div>
            </div>
          </div>

          {!kundeOk && <p className="text-xs text-red-600">Kunde nicht mit sevDesk verknüpft.</p>}
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0 sm:items-center">
          {!bereit && kundeOk && positionen.length > 0 && !laedtTexte && (
            <p className="text-xs text-muted-foreground sm:mr-auto">
              {fehlendeStunden ? `${fehlendeStunden} Position(en) ohne Stunden. ` : ''}{fehlendeTexte ? `${fehlendeTexte} Position(en) ohne Leistungsbeschreibung.` : ''}
            </p>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={anlegen} disabled={busy || !bereit}>
            {busy ? 'Wird angelegt…' : 'Entwurf in sevDesk anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
