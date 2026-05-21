import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, Loader2, CheckCircle2, AlertTriangle, X, Wand2, Trash2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const INVOICE_TYPES = [
  ['partial_invoice', 'Teilrechnung'],
  ['final_invoice', 'Schlussrechnung'],
  ['advance_invoice', 'Anzahlung'],
  ['correction', 'Korrektur'],
  ['credit_note', 'Gutschrift'],
];

const PAYMENT_STATUSES = [
  ['open', 'Offen'],
  ['partially_paid', 'Teilbezahlt'],
  ['paid', 'Bezahlt'],
  ['overdue', 'Überfällig'],
  ['cancelled', 'Storniert'],
  ['unclear', 'Unklar'],
];

function fmt(n) {
  return n != null && n !== '' ? `€ ${Number(n).toLocaleString('de-AT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
}

// Single scanned invoice row with editable fields
function ScannedInvoiceRow({ item, index, billingBlocks, onChange, onRemove }) {
  const d = item.data;
  const set = (k, v) => onChange(index, { ...d, [k]: v });

  if (item.status === 'scanning') {
    return (
      <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-xl text-sm">
        <Loader2 className="w-4 h-4 animate-spin text-primary flex-shrink-0" />
        <span className="text-muted-foreground">Scanne <strong>{item.fileName}</strong>…</span>
      </div>
    );
  }

  if (item.status === 'error') {
    return (
      <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-xl text-sm">
        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <span className="text-red-700">{item.fileName}: Scan fehlgeschlagen</span>
        <Button variant="ghost" size="icon" className="ml-auto h-6 w-6" onClick={() => onRemove(index)}>
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className="border rounded-xl p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
          <span className="text-xs text-muted-foreground truncate max-w-[180px]">{item.fileName}</span>
          {d.is_credit_note && <Badge className="text-xs bg-purple-100 text-purple-700">Gutschrift</Badge>}
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemove(index)}>
          <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
        <div>
          <Label className="text-xs">Rechnungsnr.</Label>
          <Input className="h-8 text-xs" value={d.invoice_number || ''} onChange={e => set('invoice_number', e.target.value)} placeholder="RE-2026-001" />
        </div>
        <div>
          <Label className="text-xs">Datum</Label>
          <Input className="h-8 text-xs" type="date" value={d.invoice_date || ''} onChange={e => set('invoice_date', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Kundenname</Label>
          <Input className="h-8 text-xs" value={d.customer_name || ''} onChange={e => set('customer_name', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Netto (€)</Label>
          <Input className="h-8 text-xs" type="number" value={d.net_amount ?? ''} onChange={e => set('net_amount', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Brutto (€)</Label>
          <Input className="h-8 text-xs" type="number" value={d.gross_amount ?? ''} onChange={e => set('gross_amount', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">MwSt. (%)</Label>
          <Input className="h-8 text-xs" type="number" value={d.vat_rate ?? 20} onChange={e => set('vat_rate', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Typ</Label>
          <Select value={d.invoice_type || 'partial_invoice'} onValueChange={v => set('invoice_type', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{INVOICE_TYPES.map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Zahlungsstatus</Label>
          <Select value={d.payment_status || 'open'} onValueChange={v => set('payment_status', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{PAYMENT_STATUSES.map(([v, l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Bereits bezahlt (€)</Label>
          <Input className="h-8 text-xs" type="number" value={d.paid_amount ?? 0} onChange={e => set('paid_amount', e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Fällig am</Label>
          <Input className="h-8 text-xs" type="date" value={d.due_date || ''} onChange={e => set('due_date', e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label className="text-xs">Paket zuordnen</Label>
          <Select value={d.billing_block_id || ''} onValueChange={v => set('billing_block_id', v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Paket wählen…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={null} className="text-xs">— Kein Paket —</SelectItem>
              {billingBlocks.map(b => (
                <SelectItem key={b.id} value={b.id} className="text-xs">
                  {b.title} ({fmt(b.amount_net)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}

export default function InvoiceScanUploader({ confirmedOrderId, customerName, billingBlocks = [], onSaved, onCancel }) {
  const fileRef = useRef();
  const [items, setItems] = useState([]); // { fileName, status, data, fileUrl }
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const scanFile = async (file) => {
    const idx = items.length; // captured before setState
    setItems(prev => [...prev, { fileName: file.name, status: 'scanning', data: {}, fileUrl: '' }]);

    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Du bist ein Experten-System für österreichische Ausgangsrechnungen.
Analysiere das Dokument vollständig und extrahiere alle relevanten Rechnungsdaten.
Gib ein JSON zurück:
- invoice_number: Rechnungsnummer (string)
- invoice_date: Rechnungsdatum YYYY-MM-DD
- customer_name: Rechnungsempfänger / Kundenname
- net_amount: Nettobetrag als Zahl
- gross_amount: Bruttobetrag als Zahl
- vat_rate: Mehrwertsteuersatz als Zahl (z.B. 20)
- vat_amount: MwSt-Betrag als Zahl
- due_date: Fälligkeitsdatum YYYY-MM-DD
- payment_status: einer von: open, paid, partially_paid, overdue, unclear
- paid_amount: bereits bezahlter Betrag (0 wenn nicht angegeben)
- invoice_type: einer von: partial_invoice, final_invoice, advance_invoice, correction, credit_note
- is_credit_note: true/false ob es eine Gutschrift ist
- description: Leistungsbeschreibung (max 200 Zeichen)
- notes: Besondere Hinweise

Setze null wenn ein Feld nicht gefunden wird.`,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          invoice_number: { type: 'string' },
          invoice_date: { type: 'string' },
          customer_name: { type: 'string' },
          net_amount: { type: 'number' },
          gross_amount: { type: 'number' },
          vat_rate: { type: 'number' },
          vat_amount: { type: 'number' },
          due_date: { type: 'string' },
          payment_status: { type: 'string' },
          paid_amount: { type: 'number' },
          invoice_type: { type: 'string' },
          is_credit_note: { type: 'boolean' },
          description: { type: 'string' },
          notes: { type: 'string' },
        }
      }
    });

    setItems(prev => prev.map((item, i) => {
      if (item.fileName !== file.name || item.status !== 'scanning') return item;
      return {
        fileName: file.name,
        status: 'ready',
        fileUrl: file_url,
        data: {
          customer_name: result.customer_name || customerName || '',
          invoice_number: result.invoice_number || '',
          invoice_date: result.invoice_date || '',
          net_amount: result.net_amount ?? '',
          gross_amount: result.gross_amount ?? '',
          vat_rate: result.vat_rate ?? 20,
          vat_amount: result.vat_amount ?? '',
          due_date: result.due_date || '',
          payment_status: result.payment_status || 'open',
          paid_amount: result.paid_amount ?? 0,
          invoice_type: result.invoice_type || 'partial_invoice',
          is_credit_note: result.is_credit_note || false,
          description: result.description || '',
          notes: result.notes || '',
          billing_block_id: '',
          confirmed_order_id: confirmedOrderId,
          source_type: 'pdf',
          match_status: 'manually_matched',
          match_confidence: 100,
        }
      };
    }));
  };

  const handleFiles = async (files) => {
    const arr = Array.from(files).filter(f => f.type.match(/pdf|image/));
    // scan all in parallel
    await Promise.all(arr.map(f => scanFile(f)));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };

  const handleChange = (index, newData) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, data: newData } : item));
  };

  const handleRemove = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveAll = async () => {
    setSaving(true);
    const readyItems = items.filter(i => i.status === 'ready');
    let count = 0;
    for (const item of readyItems) {
      const d = item.data;
      const net = Number(d.net_amount) || 0;
      const vat = Number(d.vat_rate) || 20;
      const gross = Number(d.gross_amount) || net * (1 + vat / 100);
      const paid = Number(d.paid_amount) || 0;
      await base44.entities.InvoiceRecord.create({
        ...d,
        net_amount: net,
        gross_amount: gross,
        vat_amount: gross - net,
        vat_rate: vat,
        paid_amount: paid,
        open_amount: gross - paid,
        is_credit_note: Boolean(d.is_credit_note),
        source_file: item.fileUrl,
        confirmed_order_id: confirmedOrderId,
      });
      count++;
    }
    setSaving(false);
    setSavedCount(count);
    setTimeout(() => onSaved(), 800);
  };

  const readyCount = items.filter(i => i.status === 'ready').length;
  const scanningCount = items.filter(i => i.status === 'scanning').length;

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm font-medium">Rechnungen hochladen & scannen</p>
        <p className="text-xs text-muted-foreground mt-1">PDF, PNG, JPG — mehrere Dateien gleichzeitig möglich</p>
        <Button size="sm" variant="outline" className="mt-3" type="button">
          <Plus className="w-3.5 h-3.5 mr-1" /> Dateien auswählen
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />

      {/* Scanned items */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((item, i) => (
            <ScannedInvoiceRow
              key={`${item.fileName}-${i}`}
              item={item}
              index={i}
              billingBlocks={billingBlocks}
              onChange={handleChange}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}

      {/* Summary + actions */}
      {(readyCount > 0 || scanningCount > 0) && (
        <div className="flex items-center justify-between pt-2 border-t">
          <p className="text-sm text-muted-foreground">
            {scanningCount > 0 && <span className="mr-3"><Loader2 className="w-3.5 h-3.5 inline animate-spin mr-1" />{scanningCount} werden gescannt…</span>}
            {readyCount > 0 && <span className="text-emerald-600 font-medium">{readyCount} bereit zum Speichern</span>}
            {savedCount > 0 && <span className="text-emerald-600 font-medium"> ✓ {savedCount} gespeichert</span>}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Abbrechen</Button>
            <Button size="sm" onClick={handleSaveAll} disabled={saving || readyCount === 0 || scanningCount > 0}>
              {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Speichern…</> : <><CheckCircle2 className="w-3.5 h-3.5 mr-1" />{readyCount} Rechnung{readyCount !== 1 ? 'en' : ''} speichern</>}
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onCancel}>Abbrechen</Button>
        </div>
      )}
    </div>
  );
}