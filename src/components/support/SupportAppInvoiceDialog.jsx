import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { supportVerrechnungsMinuten } from '@/lib/zeit/rundung';

// Rechnung aus dem Kundenblock (22.10.2026): Support-Tickets und Regie eines Kunden in EINER Rechnung.
// Je Position gelten Art, Stundensatz und Regel der Position:
//  - Support: je Ticket eine Position, Leistungsbeschreibung aus dem Ticket; gebuchte Zeit nach
//    Support-Regel (Minimum 0,5 h, danach 15-Minuten-Schritte); ohne Zeit von Hand (mit Begründung).
//  - Regie: je Tag und Projekt eine Position mit den Tätigkeiten dieses Tages; Stunden gerundet nach
//    der Projektregel (vom Server als billable_minutes geliefert), kein Minimum je Position.
//    Positionen „vor der Umstellung" sind nicht vorausgewählt — sie können in aWork schon verrechnet sein.
const datum = (d) => (d ? new Date(d).toLocaleDateString('de-AT') : '—');
const zweiStellen = (n) => Math.round(n * 100) / 100;
const ausGebucht = (min) => supportVerrechnungsMinuten(min) / 60;
const regelSupport = (h) => {
  const n = Number(String(h).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(0.5, Math.ceil(n * 4) / 4);
};
const regelRegie = (h) => {
  const n = Number(String(h).replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return zweiStellen(n);
};
const REGIE_KOPF = 'Sehr geehrte Damen und Herren,\n\nbeiliegend erhalten Sie die Verrechnung der nach Aufwand erbrachten Leistungen.';
const eur = (n) => n.toLocaleString('de-AT', { style: 'currency', currency: 'EUR' });

export default function SupportAppInvoiceDialog({ row, open, onOpenChange, onDone }) {
  // Art je Position: im Kundenblock steht sie an der Position, sonst an der Zeile
  const istRegie = (t) => (t.art ? t.art === 'regie' : row.art === 'regie');
  const regelVon = (t) => (istRegie(t) ? regelRegie : regelSupport);
  const startStunden = (t) => {
    if (istRegie(t)) return t.billable_minutes > 0 ? String(zweiStellen(t.billable_minutes / 60)) : '';
    return t.open_minutes > 0 ? String(ausGebucht(t.open_minutes)) : '';
  };
  const startText = (t) => {
    if (t.ticket_id) return '';
    if (!istRegie(t)) {
      // Bemerkungen der Buchungen als Leistungstext (12.10.2026)
      const texte = [...new Set((t.buchungs_notizen || []).map((n) => n.text).filter(Boolean))];
      return texte.join(', ') || 'Supportleistungen ohne Ticketzuordnung';
    }
    return (t.notizen || []).join('; ') || 'Regieleistungen';
  };
  // Nicht vorausgewählt: Buchungen vor der Umstellung, und Tickets ohne verrechenbare Zeit, bei denen
  // bewusst nicht verrechenbar gebucht oder „ohne Zeit erledigt“ mit Grund angegeben wurde (21.10.2026)
  const vorauswahl = (t) => !t.vorbehalt && !(t.ohne_zeit && (t.nicht_verrechenbar_minutes > 0 || t.ohne_zeit_grund));
  // Einzelrechnung: die eine, bewusst gewählte Position ist immer ausgewählt (außer vor der Umstellung)
  const [selected, setSelected] = useState(() => (row.tasks.length === 1
    ? row.tasks.filter((t) => !t.vorbehalt)
    : row.tasks.filter(vorauswahl)).map((t) => t.key));
  // Eingetippte Stunden ohne Buchung brauchen eine interne Begründung (steht nicht auf der Rechnung)
  const [begruendung, setBegruendung] = useState({});
  const [stunden, setStunden] = useState(() => Object.fromEntries(row.tasks.map((t) => [t.key, startStunden(t)])));
  const [texte, setTexte] = useState(() => Object.fromEntries(row.tasks.map((t) => [t.key, startText(t)])));
  // Stundensatz je Position — Support und Regie haben verschiedene Sätze
  const [saetze, setSaetze] = useState(() => Object.fromEntries(row.tasks.map((t) => [t.key, String(t.stundensatz || row.stundensatz || 130)])));
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
  const projekteGewaehlt = [...new Set(gewaehlt.map((t) => t.projekt_name || row.project_name).filter(Boolean))];
  const mehrereProjekte = projekteGewaehlt.length > 1;
  const satzVon = (t) => Number(String(saetze[t.key] ?? '').replace(',', '.')) || 0;
  const positionen = gewaehlt.map((t) => {
    const menge = regelVon(t)(stunden[t.key]);
    const leistung = String(texte[t.key] || '').trim();
    const zeitraum = istRegie(t) && t.first_entry_date && t.last_entry_date && t.first_entry_date !== t.last_entry_date
      ? `geleistet ${datum(t.first_entry_date)} bis ${datum(t.last_entry_date)}`
      : (t.last_entry_date ? `geleistet am ${datum(t.last_entry_date)}` : '');
    // Regie je Tag: das Datum steht schon im Namen — in der Fußzeile nur noch die Personen
    const fussZeit = istRegie(t) && t.tag ? '' : (t.erledigt_am ? `erledigt am ${datum(t.erledigt_am)}` : zeitraum);
    const fusszeile = [fussZeit, t.assignee_name].filter(Boolean).join(' · ');
    // Mehrere Projekte auf einer Rechnung: Projektname vor die Position, damit die Liste geordnet bleibt
    const projekt = t.projekt_name || row.project_name || '';
    const name = mehrereProjekte && projekt ? `${projekt}: ${t.task_title}` : t.task_title;
    return {
      key: t.key,
      ticket_id: istRegie(t) ? null : (t.ticket_id || null),
      art: istRegie(t) ? 'regie' : 'support',
      projekt,
      name,
      leistung,
      text: [leistung, fusszeile].filter(Boolean).join('\n'),
      quantity: menge,
      price: satzVon(t),
      ...(t.ohne_zeit ? { ohne_buchung: true, stunden_begruendung: String(begruendung[t.key] || '').trim() } : {}),
    };
  });
  const fehlendeStunden = positionen.filter((p) => p.quantity <= 0).length;
  const fehlendeTexte = positionen.filter((p) => !p.leistung).length;
  const fehlendeBegruendung = positionen.filter((p) => p.ohne_buchung && !p.stunden_begruendung).length;
  const fehlenderSatz = positionen.filter((p) => !(p.price > 0)).length;
  const summeStunden = positionen.reduce((s, p) => s + p.quantity, 0);
  const netto = Math.round(positionen.reduce((s, p) => s + p.quantity * p.price, 0) * 100) / 100;
  const kundeOk = Boolean(row.sevdesk_contact_id);
  const bereit = kundeOk && positionen.length > 0 && !fehlendeStunden && !fehlendeTexte && !fehlendeBegruendung && !fehlenderSatz && netto > 0 && !laedtTexte;

  const nurRegie = positionen.length > 0 && positionen.every((p) => p.art === 'regie');
  const nurSupport = positionen.length > 0 && positionen.every((p) => p.art === 'support');
  const saetzeText = [...new Set(positionen.map((p) => p.price))].map((s) => `${s} €/h`).join(' / ');

  const anlegen = async () => {
    setBusy(true);
    setFehler('');
    try {
      const header = nurRegie
        ? `Verrechnung Regieleistungen: ${projekteGewaehlt.join(', ')}`
        : nurSupport
          ? (positionen.length === 1
            ? `Verrechnung Supportauftrag: ${positionen[0].name}`
            : `Verrechnung Supportauftrag: ${positionen.map((p) => p.name).join(', ')}`)
          : 'Verrechnung Leistungen nach Aufwand';
      const regiePos = gewaehlt.filter(istRegie);
      const supportPos = gewaehlt.filter((t) => !istRegie(t));
      const rundung = regiePos.find((t) => t.rundung)?.rundung || row.rundung;
      const rundungText = rundung?.rundung_minuten
        ? `Regie auf ${rundung.rundung_minuten} Minuten je ${rundung.rundung_basis === 'buchung' ? 'Buchung' : 'Tag'} gerundet`
        : 'Regie minutengenau';
      const mitVorleistung = supportPos.filter((t) => t.vorleistung_minutes > 0 && t.ticket_id);
      // Quelle der Anweisung: im Kundenblock immer 'kunde', sonst wie bisher
      const quelle = row.art === 'kunde' ? 'kunde' : (row.art === 'regie' ? 'regie' : 'app');
      const regieProjekte = [...new Set(regiePos.map((t) => t.project_id).filter(Boolean))];
      const instr = await base44.entities.BillingInstruction.create({
        project_id: row.liquidity_project_id || '',
        customer_name: row.customer_name,
        project_name: projekteGewaehlt.join(' · ') || row.project_name,
        instruction_type: 'manual_amount',
        invoice_type: 'partial_invoice',
        status: 'ready_for_backoffice',
        instruction_amount_net: netto,
        invoice_reason: nurRegie
          ? `Verrechnung Regie: ${projekteGewaehlt.join(', ')} — ${positionen.length} Position(en), ${summeStunden.toFixed(2)} h`
          : nurSupport
            ? (positionen.length === 1
              ? `Verrechnung Supportauftrag: ${positionen[0].name} (${summeStunden.toFixed(2)} h)`
              : `Verrechnung Supportauftrag — ${positionen.length} Anfragen, ${summeStunden.toFixed(2)} h`)
            : `Verrechnung nach Aufwand — ${supportPos.length} Support-, ${regiePos.length} Regie-Position(en), ${summeStunden.toFixed(2)} h`,
        internal_note: [
          supportPos.length ? `Support aus Agency-Manager-Tickets (erledigt), Minimum 0,5 h, danach 15-Minuten-Schritte` : '',
          regiePos.length ? `Regie aus Zeitbuchungen je Tag und Projekt, ${rundungText}` : '',
          `${positionen.length} Positionen, ${saetzeText}`,
        ].filter(Boolean).join(' — '),
        source_snapshot_json: JSON.stringify({
          quelle,
          ...(quelle === 'regie' ? { regie_project_id: row.project_id } : {}),
          ...(regieProjekte.length ? { regie_project_ids: regieProjekte } : {}),
          ...(!nurSupport ? { head_text: REGIE_KOPF } : {}),
          client_id: row.client_id,
          project_id: gewaehlt[0]?.project_id || null,
          // Regie: Aufgaben bleiben offen — nur die Zeitbuchungen gelten als verrechnet
          support_ticket_ids: supportPos.filter((t) => t.ticket_id).map((t) => t.ticket_id),
          time_entry_ids: gewaehlt.flatMap((t) => t.time_entry_ids || []),
          // Ohne Ticket gebuchte Zeit, die einem Ticket zugeordnet wurde: beim Markieren wird die Zuordnung gespeichert
          zuordnung: Object.fromEntries(supportPos.filter((t) => t.ticket_id).flatMap((t) => (t.zugeordnet_ids || []).map((id) => [id, t.ticket_id]))),
          vorleistung_ticket_ids: mitVorleistung.map((t) => t.ticket_id),
          awork_vorleistung_task_ids: mitVorleistung.map((t) => t.awork_task_id).filter(Boolean),
          sevdesk_contact_id: row.sevdesk_contact_id || null,
          invoice_header: header,
          hourly_rate: positionen[0]?.price || null,
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

  // Positionen je Projekt gruppiert anzeigen — in der Reihenfolge, in der sie kommen
  const gruppen = [];
  for (const t of row.tasks) {
    const name = t.projekt_name || row.project_name || '';
    let g = gruppen.find((x) => x.name === name);
    if (!g) { g = { name, regie: istRegie(t), tasks: [] }; gruppen.push(g); }
    g.tasks.push(t);
  }
  const mitRegie = row.tasks.some(istRegie);
  const mitSupport = row.tasks.some((t) => !istRegie(t));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle>Rechnung anlegen — {row.customer_name || row.project_name}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Alle gewählten Positionen kommen in eine Rechnung. Die Leistungsbeschreibung steht so auf der Rechnung — bitte prüfen.
            {mitSupport && ' Support: je Ticket eine Position, Minimum 0,5 h, danach in 15-Minuten-Schritten.'}
            {mitRegie && ' Regie: je Tag und Projekt eine Position mit den Tätigkeiten des Tages, gerundet nach der Projektregel; Buchungen vor der Umstellung sind nicht vorausgewählt.'}
          </p>

          {gruppen.map((g) => (
            <div key={g.name} className="space-y-2">
              {gruppen.length > 1 && (
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {g.name} · {g.regie ? 'Regie' : 'Support'}
                </p>
              )}
              {g.tasks.map((t) => {
                const aktiv = selected.includes(t.key);
                const menge = regelVon(t)(stunden[t.key]);
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
                      <div className="w-20 flex-shrink-0">
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
                      <div className="w-20 flex-shrink-0">
                        <Label className="text-xs">€/h</Label>
                        <Input
                          type="number"
                          min="0"
                          value={saetze[t.key]}
                          onChange={(e) => setSaetze((s) => ({ ...s, [t.key]: e.target.value }))}
                          disabled={!aktiv}
                        />
                      </div>
                      <div className="w-24 flex-shrink-0 text-right">
                        <Label className="text-xs">Betrag</Label>
                        <div className="h-9 flex items-center justify-end text-sm font-medium">{eur(menge * satzVon(t))}</div>
                      </div>
                    </div>
                    {leer && (
                      <p className="text-xs text-red-600 ml-7">
                        Keine verrechenbare Zeit gebucht — bitte Stunden eintragen{t.target_hours ? ` (Plan: ${t.target_hours} h)` : ''}.
                      </p>
                    )}
                    {t.ohne_zeit && (t.nicht_verrechenbar_minutes > 0 || t.ohne_zeit_grund) && (
                      <p className="text-xs text-amber-800 ml-7">
                        {t.nicht_verrechenbar_minutes > 0
                          ? `${(t.nicht_verrechenbar_minutes / 60).toFixed(2)} h als nicht verrechenbar gebucht (${(t.nicht_verrechenbar_gruende || []).join(', ')}).`
                          : ''}
                        {t.ohne_zeit_grund ? ` Ohne Zeit erledigt: ${t.ohne_zeit_grund}${t.ohne_zeit_notiz ? ` — ${t.ohne_zeit_notiz}` : ''}.` : ''}
                      </p>
                    )}
                    {t.ohne_zeit && aktiv && (
                      <div className="ml-7">
                        <Label className="text-xs">Begründung für die Stunden (intern, nicht auf der Rechnung) *</Label>
                        <Input
                          value={begruendung[t.key] || ''}
                          placeholder="z. B. Zeit lag in aWork, 30 min laut Kollegen"
                          onChange={(e) => setBegruendung((s) => ({ ...s, [t.key]: e.target.value }))}
                          className={String(begruendung[t.key] || '').trim() ? '' : 'border-red-500'}
                        />
                      </div>
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
          ))}

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Stundensätze</Label>
              <div className="h-9 flex items-center text-sm">{saetzeText || '—'}</div>
            </div>
            <div>
              <Label className="text-xs">Positionen / Stunden</Label>
              <div className="h-9 flex items-center text-sm">{positionen.length} · {summeStunden.toFixed(2)} h</div>
            </div>
            <div>
              <Label className="text-xs">Rechnungsbetrag netto</Label>
              <div className="h-9 flex items-center font-semibold">{eur(netto)}</div>
            </div>
          </div>

          {!kundeOk && <p className="text-xs text-red-600">Kunde nicht mit sevDesk verknüpft.</p>}
          {fehler && <p className="text-xs text-red-600">{fehler}</p>}
        </div>

        <DialogFooter className="px-6 py-3 border-t shrink-0 sm:items-center">
          {!bereit && kundeOk && positionen.length > 0 && !laedtTexte && (
            <p className="text-xs text-muted-foreground sm:mr-auto">
              {fehlendeStunden ? `${fehlendeStunden} Position(en) ohne Stunden. ` : ''}
              {fehlenderSatz ? `${fehlenderSatz} Position(en) ohne Stundensatz. ` : ''}
              {fehlendeTexte ? `${fehlendeTexte} Position(en) ohne Leistungsbeschreibung. ` : ''}
              {fehlendeBegruendung ? `${fehlendeBegruendung} Position(en) ohne gebuchte Zeit brauchen eine Begründung.` : ''}
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
