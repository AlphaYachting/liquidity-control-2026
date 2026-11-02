import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Trash2 } from 'lucide-react';
import { fmtEUR, fmtDate, OUTFLOW_CATEGORY_LABELS, OUTFLOW_INTERVAL_LABELS } from '@/lib/restructuring/restructuringFormat';
import { iso } from '@/lib/liquiditaet/betriebsLiquiditaet';

const Feld = ({ label, children, hinweis, className = '' }) => (
  <div className={className}>
    <Label className="text-xs">{label}</Label>
    <div className="mt-1">{children}</div>
    {hinweis && <p className="text-[10px] text-muted-foreground mt-1">{hinweis}</p>}
  </div>
);

const zahl = (v) => {
  if (v === '' || v === null || v === undefined) return 0;
  return Number(String(v).replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.')) || 0;
};

// ── Kostenposten ───────────────────────────────────────────────────────────
const LEER_POSTEN = {
  label: '', category: 'sachkosten', amount: '', interval: 'monthly', due_day_of_month: 1,
  first_due_month: '', start_month: '', end_month: '', belegstufe: 'ist', ersetzen_durch: '',
  derivation: '', scenario_only: false, is_active: true,
};

export function KostenpostenDialog({ open, posten, onClose, onGespeichert }) {
  const [form, setForm] = useState(LEER_POSTEN);
  const [speichert, setSpeichert] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(posten ? { ...LEER_POSTEN, ...posten, amount: String(posten.amount ?? '').replace('.', ',') } : LEER_POSTEN);
  }, [open, posten]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const mitMonat = form.interval !== 'monthly';

  const speichern = async () => {
    if (!form.label.trim() || zahl(form.amount) <= 0) return;
    setSpeichert(true);
    const daten = {
      label: form.label.trim(), category: form.category, amount: zahl(form.amount), interval: form.interval,
      due_day_of_month: Math.min(Math.max(Number(form.due_day_of_month) || 1, 1), 28),
      first_due_month: mitMonat ? (form.first_due_month || null) : null,
      start_month: form.start_month || null, end_month: form.end_month || null,
      belegstufe: form.belegstufe, ersetzen_durch: form.belegstufe === 'schaetzung' ? (form.ersetzen_durch || null) : null,
      derivation: form.derivation || null, scenario_only: !!form.scenario_only, is_active: form.is_active !== false,
    };
    try {
      if (posten?.id) await base44.entities.CashOutflowItem.update(posten.id, daten);
      else await base44.entities.CashOutflowItem.create(daten);
      onGespeichert();
      onClose();
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{posten?.id ? 'Kostenposten bearbeiten' : 'Kostenposten anlegen'}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Feld label="Bezeichnung" className="col-span-2">
            <Input value={form.label} onChange={(e) => set('label', e.target.value)} />
          </Feld>
          <Feld label="Kategorie">
            <Select value={form.category} onValueChange={(v) => set('category', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OUTFLOW_CATEGORY_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Feld>
          <Feld label="Betrag je Fälligkeit (€)">
            <Input inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} />
          </Feld>
          <Feld label="Rhythmus">
            <Select value={form.interval} onValueChange={(v) => set('interval', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OUTFLOW_INTERVAL_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </Feld>
          <Feld label="Fällig am (Tag im Monat)">
            <Input type="number" min={1} max={28} value={form.due_day_of_month} onChange={(e) => set('due_day_of_month', e.target.value)} />
          </Feld>
          {mitMonat && (
            <Feld label={form.interval === 'once' ? 'Fälligkeitsmonat' : 'Erster Fälligkeitsmonat'} className="col-span-2">
              <Input type="month" value={form.first_due_month || ''} onChange={(e) => set('first_due_month', e.target.value)} />
            </Feld>
          )}
          <Feld label="Läuft ab Monat" hinweis="leer = ab sofort">
            <Input type="month" value={form.start_month || ''} onChange={(e) => set('start_month', e.target.value)} />
          </Feld>
          <Feld label="Läuft bis Monat" hinweis="leer = unbefristet">
            <Input type="month" value={form.end_month || ''} onChange={(e) => set('end_month', e.target.value)} />
          </Feld>
          <Feld label="Belegstufe">
            <Select value={form.belegstufe || 'ist'} onValueChange={(v) => set('belegstufe', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ist">Ist (belegt)</SelectItem>
                <SelectItem value="schaetzung">Schätzung</SelectItem>
              </SelectContent>
            </Select>
          </Feld>
          {form.belegstufe === 'schaetzung' ? (
            <Feld label="Wird ersetzt durch">
              <Input value={form.ersetzen_durch || ''} onChange={(e) => set('ersetzen_durch', e.target.value)} placeholder="z. B. Lohnabrechnung" />
            </Feld>
          ) : <div />}
          <Feld label="Herleitung / Quelle" className="col-span-2">
            <Textarea rows={3} value={form.derivation || ''} onChange={(e) => set('derivation', e.target.value)} />
          </Feld>
          <div className="col-span-2 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={form.is_active !== false} onCheckedChange={(v) => set('is_active', v)} /> aktiv
            </label>
            <label className="flex items-center gap-2 text-xs">
              <Switch checked={!!form.scenario_only} onCheckedChange={(v) => set('scenario_only', v)} /> nur im Szenario (noch nicht freigegeben)
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={speichern} disabled={speichert || !form.label.trim() || zahl(form.amount) <= 0}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Kontostand ─────────────────────────────────────────────────────────────
const BELEG_KONTO = { auszug: 'laut Auszug', abgeleitet: 'abgeleitet', schaetzung: 'Schätzung' };
const KONTO_LABELS = { fortbetrieb: 'Fortbetriebskonto', masse: 'Massekonto (nur Info)', altkonto: 'Altkonto (nur Info)' };

export function KontostandDialog({ open, snapshots = [], onClose, onGespeichert }) {
  const juengster = snapshots.find((s) => !s.account || s.account === 'fortbetrieb');
  const leer = () => ({
    id: null, account: 'fortbetrieb', balance_date: iso(new Date()), amount: '',
    locked_amount: String(juengster?.locked_amount ?? 17500).replace('.', ','), belegstufe: 'auszug', source_ref: '', notes: '',
  });
  const [form, setForm] = useState(leer);
  const [speichert, setSpeichert] = useState(false);
  useEffect(() => { if (open) setForm(leer()); }, [open]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const bearbeiten = (s) => setForm({
    id: s.id, account: s.account || 'fortbetrieb', balance_date: s.balance_date, amount: String(s.amount ?? '').replace('.', ','),
    locked_amount: String(s.locked_amount ?? 0).replace('.', ','), belegstufe: s.belegstufe || 'auszug', source_ref: s.source_ref || '', notes: s.notes || '',
  });
  const loeschen = async (s) => {
    if (!confirm(`Kontostand vom ${fmtDate(s.balance_date)} löschen?`)) return;
    await base44.entities.BankBalanceSnapshot.delete(s.id);
    onGespeichert();
  };
  const speichern = async () => {
    if (!form.balance_date || form.amount === '') return;
    setSpeichert(true);
    const daten = {
      account: form.account, balance_date: form.balance_date, amount: zahl(form.amount), locked_amount: zahl(form.locked_amount),
      belegstufe: form.belegstufe, source_ref: form.source_ref || null, notes: form.notes || null,
    };
    try {
      if (form.id) await base44.entities.BankBalanceSnapshot.update(form.id, daten);
      else await base44.entities.BankBalanceSnapshot.create(daten);
      onGespeichert();
      setForm(leer());
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Kontostände</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          Gerechnet wird ab dem jüngsten Stand des Fortbetriebskontos. Alles, was danach fällig wird, ist noch nicht im Kontostand.
        </p>
        <div className="max-h-56 overflow-y-auto border rounded-md">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-1.5">Datum</th><th className="text-left px-2 py-1.5">Konto</th>
                <th className="text-right px-2 py-1.5">Stand</th><th className="text-right px-2 py-1.5">gesperrt</th>
                <th className="text-left px-2 py-1.5">Beleg</th><th className="px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-2 py-1.5 tabular-nums">{fmtDate(s.balance_date)}</td>
                  <td className="px-2 py-1.5">{KONTO_LABELS[s.account || 'fortbetrieb']}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtEUR(s.amount)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{s.locked_amount ? fmtEUR(s.locked_amount) : '—'}</td>
                  <td className="px-2 py-1.5">{BELEG_KONTO[s.belegstufe] || 'laut Auszug'}{s.source_ref ? ` · ${s.source_ref}` : ''}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <Button size="icon-sm" variant="ghost" onClick={() => bearbeiten(s)} title="Bearbeiten"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="icon-sm" variant="ghost" className="text-destructive" onClick={() => loeschen(s)} title="Löschen"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          <p className="col-span-full text-xs font-semibold">{form.id ? 'Kontostand bearbeiten' : 'Neuen Kontostand eintragen'}</p>
          <Feld label="Konto">
            <Select value={form.account} onValueChange={(v) => set('account', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(KONTO_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Feld>
          <Feld label="Datum"><Input type="date" value={form.balance_date} onChange={(e) => set('balance_date', e.target.value)} /></Feld>
          <Feld label="Kontostand (€)"><Input inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Feld>
          <Feld label="davon gesperrt (€)" hinweis="Stammeinlage – nie verfügbar"><Input inputMode="decimal" value={form.locked_amount} onChange={(e) => set('locked_amount', e.target.value)} /></Feld>
          <Feld label="Belegstufe">
            <Select value={form.belegstufe} onValueChange={(v) => set('belegstufe', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(BELEG_KONTO).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </Feld>
          <Feld label="Fundstelle"><Input value={form.source_ref} onChange={(e) => set('source_ref', e.target.value)} placeholder="z. B. Auszug 50" /></Feld>
          <Feld label="Notiz" className="col-span-full"><Input value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Feld>
        </div>
        <DialogFooter>
          {form.id && <Button variant="outline" onClick={() => setForm(leer())}>Neu statt bearbeiten</Button>}
          <Button variant="outline" onClick={onClose}>Schließen</Button>
          <Button onClick={speichern} disabled={speichert || !form.balance_date || form.amount === ''}>Speichern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
