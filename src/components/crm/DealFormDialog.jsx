import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PIPELINES, SOURCE_LABELS } from '@/components/crm/stages';
import { findDuplicateDeal, CLOSED_STAGES } from '@/lib/crm/crmDuplicate';
import { Link } from 'react-router-dom';

const EMPTY = {
  pipeline: 'new_business', stage: 'new_lead', title: '', company_name: '', contact_name: '',
  contact_email: '', contact_phone: '', source: 'manual', value_net: 0, probability_percent: 50,
  next_step: '', next_step_date: '', description: '',
};

const norm = (s) => String(s || '').toLowerCase().trim();

// Firma: Tippsuche im Kundenverzeichnis. Ein Treffer übernimmt Name, sevDesk-Verknüpfung
// und (falls leer) Ansprechperson/E-Mail. Ohne Treffer bleibt der getippte Name stehen (Neukunde).
function FirmaSuchfeld({ value, gewaehlt, clients, onText, onWaehlen }) {
  const [offen, setOffen] = useState(false);
  const zu = useRef(null);
  const treffer = useMemo(() => {
    const q = norm(value);
    if (!q) return clients.slice(0, 20);
    return clients.filter((c) => [c.name, c.contact_person, c.sevdesk_contact_id].some((f) => norm(f).includes(q))).slice(0, 20);
  }, [clients, value]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted-foreground" />
        <Input
          className="pl-8"
          value={value}
          placeholder="Kunde suchen oder neue Firma eintippen"
          onChange={(e) => { onText(e.target.value); setOffen(true); }}
          onFocus={() => { clearTimeout(zu.current); setOffen(true); }}
          onBlur={() => { zu.current = setTimeout(() => setOffen(false), 150); }}
        />
      </div>
      {offen && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-border rounded shadow-sm max-h-64 overflow-y-auto">
          {treffer.map((c) => (
            <button key={c.id} type="button" onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onWaehlen(c); setOffen(false); }}
              className="w-full text-left text-sm px-3 py-2 hover:bg-muted flex items-center justify-between gap-2">
              <span className="truncate">{c.name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {c.sevdesk_contact_id ? `sevDesk ${c.sevdesk_contact_id}` : 'ohne sevDesk'}
              </span>
            </button>
          ))}
          {treffer.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">Kein Kunde gefunden — der Name wird als neue Firma übernommen.</p>
          )}
        </div>
      )}
      {gewaehlt && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Bestandskunde aus dem Kundenverzeichnis{gewaehlt.sevdesk_contact_id ? ` · sevDesk ${gewaehlt.sevdesk_contact_id}` : ''}
        </p>
      )}
    </div>
  );
}

export default function DealFormDialog({ open, onOpenChange, initialData, onSaved }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState(null);
  const isEdit = Boolean(initialData?.id);
  const { data: clients = [] } = useQuery({
    queryKey: ['dealFormClients'],
    enabled: !!open,
    staleTime: 5 * 60 * 1000,
    queryFn: () => base44.entities.Client.list('name', 2000),
  });
  const gewaehlterKunde = form.linked_customer_name
    ? clients.find((c) => norm(c.name) === norm(form.linked_customer_name)) || null
    : null;

  const firmaTippen = (text) => setForm((f) => {
    const next = { ...f, company_name: text };
    // Name weicht vom gewählten Kunden ab → Verknüpfung lösen
    if (f.linked_customer_name && norm(text) !== norm(f.linked_customer_name)) {
      next.linked_customer_name = '';
      next.sevdesk_contact_id = '';
    }
    return next;
  });

  const kundeWaehlen = (c) => setForm((f) => {
    const next = {
      ...f,
      company_name: c.name,
      linked_customer_name: c.name,
      sevdesk_contact_id: c.sevdesk_contact_id || '',
      contact_name: f.contact_name || c.contact_person || '',
      contact_email: f.contact_email || c.contact_email || '',
    };
    // Neuer Deal zu einem bestehenden Kunden gehört in die Bestandskunden-Pipeline
    if (!isEdit && f.pipeline === 'new_business') {
      next.pipeline = 'existing_customer';
      next.stage = PIPELINES.existing_customer.stages[0].key;
    }
    return next;
  });

  useEffect(() => {
    if (open) {
      const merged = { ...EMPTY, ...(initialData || {}) };
      // Startphase immer zur Pipeline passend setzen (Bug: Bestandskunden-Deal landete sonst unsichtbar in Neukunden-Phase)
      if (!initialData?.id && !initialData?.stage) merged.stage = PIPELINES[merged.pipeline].stages[0].key;
      setForm(merged);
      setDuplicate(null);
    }
  }, [open, initialData]);

  // Duplikatprüfung beim Anlegen — Hinweis, keine Sperre
  useEffect(() => {
    if (!open || isEdit) return;
    const email = (form.contact_email || '').trim();
    const company = (form.company_name || '').trim();
    if (!email && !company) { setDuplicate(null); return; }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const deals = await base44.entities.CrmDeal.list('-updated_date', 300).catch(() => []);
      const open_ = deals.filter(d => !CLOSED_STAGES.includes(d.stage) && d.id !== initialData?.id);
      const hit = findDuplicateDeal(open_, { contactEmail: email, companyName: company });
      if (!cancelled) setDuplicate(hit || null);
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, isEdit, form.contact_email, form.company_name]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePipelineChange = (p) => {
    setForm(f => ({ ...f, pipeline: p, stage: isEdit ? f.stage : PIPELINES[p].stages[0].key }));
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const data = { ...form, value_net: Number(form.value_net) || 0, probability_percent: Number(form.probability_percent) || 0 };
      delete data.id; delete data.created_date; delete data.updated_date; delete data.created_by_id; delete data.created_by;
      let saved;
      if (isEdit) saved = await base44.entities.CrmDeal.update(initialData.id, data);
      else saved = await base44.entities.CrmDeal.create(data);
      onSaved?.(saved);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Deal bearbeiten' : 'Neuer Deal'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Pipeline</Label>
              <Select value={form.pipeline} onValueChange={handlePipelineChange}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new_business">Neukunden</SelectItem>
                  <SelectItem value="existing_customer">Bestandskunden</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Quelle</Label>
              <Select value={form.source} onValueChange={v => set('source', v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs">Deal-Bezeichnung *</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="z.B. Website-Relaunch Musterfirma" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Firma</Label>
              <FirmaSuchfeld
                value={form.company_name || ''}
                gewaehlt={gewaehlterKunde}
                clients={clients}
                onText={firmaTippen}
                onWaehlen={kundeWaehlen}
              />
            </div>
            <div>
              <Label className="text-xs">Ansprechperson</Label>
              <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">E-Mail</Label>
              <Input type="email" value={form.contact_email} onChange={e => set('contact_email', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Telefon</Label>
              <Input value={form.contact_phone} onChange={e => set('contact_phone', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Erwarteter Wert netto (€)</Label>
              <Input type="number" value={form.value_net} onChange={e => set('value_net', e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Wahrscheinlichkeit (%)</Label>
              <Input type="number" min={0} max={100} value={form.probability_percent} onChange={e => set('probability_percent', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nächster Schritt</Label>
              <Input value={form.next_step} onChange={e => set('next_step', e.target.value)} placeholder="z.B. Rückruf vereinbaren" />
            </div>
            <div>
              <Label className="text-xs">Fällig am</Label>
              <Input type="date" value={form.next_step_date || ''} onChange={e => set('next_step_date', e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Beschreibung</Label>
            <Textarea rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          {duplicate && (
            <div className="border border-amber-200 bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-800">
              Es gibt bereits einen offenen Deal zu diesem Kontakt:{' '}
              <Link to={`/crm/deals/${duplicate.id}`} onClick={() => onOpenChange(false)} className="font-semibold underline">
                {duplicate.title}
              </Link>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
            <Button onClick={save} disabled={saving || !form.title.trim()}>
              {saving ? 'Speichert…' : isEdit ? 'Speichern' : 'Deal anlegen'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}