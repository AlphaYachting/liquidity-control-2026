import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Upload, Loader2, CheckCircle2, AlertTriangle, X, FileText, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function NewOrderUploadModal({ onClose }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef();

  const [step, setStep] = useState('upload'); // upload | scanning | review | saving | done
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState('');
  const [error, setError] = useState('');
  const [scanResult, setScanResult] = useState(null);

  // Editable form state after scan
  const [form, setForm] = useState({
    customer: '',
    project_name: '',
    order_number: '',
    total_net_amount: '',
    total_gross_amount: '',
    vat_rate: 20,
    payment_terms: '',
    responsible_project_manager: '',
    confirmation_date: '',
    description: '',
    notes: '',
    status: 'confirmed',
    source_type: 'pdf',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  const handleScan = async () => {
    if (!file) return;
    setStep('scanning');
    setError('');

    // 1. Upload file
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFileUrl(file_url);

    // 2. AI scan
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: `Du bist ein Experten-System für österreichische Auftragsbestätigungen (AB).
Analysiere das hochgeladene Dokument vollständig und extrahiere alle relevanten Daten.
Gib ein JSON zurück mit folgenden Feldern:
- customer: Kundenname (Firma oder Person)
- project_name: Projektbezeichnung / Leistungsbeschreibung
- order_number: AB-Nummer oder Auftragsnummer (z.B. AB-2026-001)
- total_net_amount: Gesamtbetrag netto als Zahl (ohne Währungssymbol, Punkt als Dezimaltrennzeichen)
- total_gross_amount: Gesamtbetrag brutto als Zahl
- vat_rate: Mehrwertsteuersatz als Zahl (z.B. 20)
- payment_terms: Zahlungsbedingungen (z.B. "14 Tage netto", "50% Anzahlung")
- confirmation_date: Datum der AB im Format YYYY-MM-DD
- responsible_project_manager: Projektverantwortliche(r) wenn genannt
- description: Kurze Leistungsbeschreibung (max 200 Zeichen)
- billing_blocks: Array von Abrechnungspaketen, jedes mit:
  - title: Name des Pakets
  - amount_net: Betrag netto als Zahl
  - description: Kurzbeschreibung
  - billing_month: geplanter Abrechnungsmonat im Format YYYY-MM (schätzen falls nicht angegeben)
- notes: Besondere Hinweise oder Bedingungen

Wenn ein Feld nicht im Dokument gefunden wird, setze null.`,
      file_urls: [file_url],
      response_json_schema: {
        type: 'object',
        properties: {
          customer: { type: 'string' },
          project_name: { type: 'string' },
          order_number: { type: 'string' },
          total_net_amount: { type: 'number' },
          total_gross_amount: { type: 'number' },
          vat_rate: { type: 'number' },
          payment_terms: { type: 'string' },
          confirmation_date: { type: 'string' },
          responsible_project_manager: { type: 'string' },
          description: { type: 'string' },
          billing_blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                amount_net: { type: 'number' },
                description: { type: 'string' },
                billing_month: { type: 'string' },
              }
            }
          },
          notes: { type: 'string' },
        }
      }
    });

    setScanResult(result);
    setForm({
      customer: result.customer || '',
      project_name: result.project_name || '',
      order_number: result.order_number || '',
      total_net_amount: result.total_net_amount != null ? String(result.total_net_amount) : '',
      total_gross_amount: result.total_gross_amount != null ? String(result.total_gross_amount) : '',
      vat_rate: result.vat_rate || 20,
      payment_terms: result.payment_terms || '',
      responsible_project_manager: result.responsible_project_manager || '',
      confirmation_date: result.confirmation_date || '',
      description: result.description || '',
      notes: result.notes || '',
      status: 'confirmed',
      source_type: 'pdf',
    });
    setStep('review');
  };

  const handleSave = async () => {
    setStep('saving');
    setError('');

    const net = Number(form.total_net_amount) || 0;
    const vat = Number(form.vat_rate) || 20;
    const gross = Number(form.total_gross_amount) || net * (1 + vat / 100);

    // 1. Create ConfirmedOrder
    const order = await base44.entities.ConfirmedOrder.create({
      ...form,
      total_net_amount: net,
      total_gross_amount: gross,
      vat_rate: vat,
      document_url: fileUrl,
    });

    // 2. Create LiquidityProject
    const project = await base44.entities.LiquidityProject.create({
      customer: form.customer,
      project_name: form.project_name,
      order_number: form.order_number,
      total_net_amount: net,
      open_amount: net,
      project_manager: form.responsible_project_manager,
      status: 'active',
      notes: form.description || form.notes,
      source_sheet: 'AB-Upload',
    });

    // 3. Create BillingBlocks if extracted
    const blocks = scanResult?.billing_blocks || [];
    for (const b of blocks) {
      if (!b.title) continue;
      await base44.entities.ProjectBillingBlock.create({
        confirmed_order_id: order.id,
        project_id: project.id,
        customer: form.customer,
        project_name: form.project_name,
        title: b.title,
        amount_net: Number(b.amount_net) || 0,
        amount_gross: (Number(b.amount_net) || 0) * (1 + vat / 100),
        vat_rate: vat,
        description: b.description || '',
        billing_month: b.billing_month || '',
        invoice_readiness_status: 'not_ready',
        work_status: 'not_started',
        probability_percent: 90,
      });
    }

    queryClient.invalidateQueries({ queryKey: ['confirmedOrders'] });
    queryClient.invalidateQueries({ queryKey: ['billingBlocks'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });

    setStep('done');
    setTimeout(() => navigate(`/confirmed-orders/${order.id}`), 1200);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-bold">Auftragsbestätigung hochladen & scannen</h2>
            <p className="text-sm text-muted-foreground">PDF oder Bild hochladen → AI erkennt alle Daten automatisch</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>

        <div className="p-5 space-y-5">
          {/* Step: upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-border rounded-xl p-10 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                {file ? (
                  <div>
                    <p className="font-semibold text-primary">{file.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">{(file.size / 1024).toFixed(0)} KB</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium">PDF oder Bild hierher ziehen</p>
                    <p className="text-sm text-muted-foreground mt-1">oder klicken zum Auswählen</p>
                    <p className="text-xs text-muted-foreground mt-2">PDF, PNG, JPG, JPEG</p>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" className="hidden" onChange={handleFileChange} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={onClose}>Abbrechen</Button>
                <Button onClick={handleScan} disabled={!file}>
                  <Wand2 className="w-4 h-4 mr-2" /> Jetzt scannen
                </Button>
              </div>
            </div>
          )}

          {/* Step: scanning */}
          {step === 'scanning' && (
            <div className="text-center py-12 space-y-3">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
              <p className="font-semibold text-lg">Dokument wird gescannt…</p>
              <p className="text-sm text-muted-foreground">AI liest alle Felder aus der Auftragsbestätigung</p>
            </div>
          )}

          {/* Step: review */}
          {step === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                Scan erfolgreich! Bitte Daten prüfen und bei Bedarf korrigieren.
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Kunde *</Label>
                  <Input required value={form.customer} onChange={e => set('customer', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Projektname *</Label>
                  <Input required value={form.project_name} onChange={e => set('project_name', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">AB-Nummer</Label>
                  <Input value={form.order_number} onChange={e => set('order_number', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Datum</Label>
                  <Input type="date" value={form.confirmation_date} onChange={e => set('confirmation_date', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Betrag netto (€)</Label>
                  <Input type="number" value={form.total_net_amount} onChange={e => set('total_net_amount', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Betrag brutto (€)</Label>
                  <Input type="number" value={form.total_gross_amount} onChange={e => set('total_gross_amount', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">MwSt. (%)</Label>
                  <Input type="number" value={form.vat_rate} onChange={e => set('vat_rate', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Zahlungsbedingungen</Label>
                  <Input value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} placeholder="14 Tage netto" />
                </div>
                <div>
                  <Label className="text-xs">Projektmanager</Label>
                  <Input value={form.responsible_project_manager} onChange={e => set('responsible_project_manager', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={v => set('status', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[['confirmed','Bestätigt'],['draft','Entwurf'],['unclear','Unklar']].map(([v,l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Beschreibung / Notizen</Label>
                  <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} />
                </div>
              </div>

              {/* Extracted billing blocks preview */}
              {scanResult?.billing_blocks?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-2">
                    Erkannte Abrechnungspakete ({scanResult.billing_blocks.length})
                  </p>
                  <div className="space-y-1">
                    {scanResult.billing_blocks.map((b, i) => (
                      <div key={i} className="flex justify-between items-center p-2 bg-muted/40 rounded-lg text-sm">
                        <span>{b.title}</span>
                        <span className="font-semibold">
                          {b.amount_net != null ? `€ ${Number(b.amount_net).toLocaleString('de-AT', { minimumFractionDigits: 2 })}` : '—'}
                          {b.billing_month && <span className="text-xs text-muted-foreground ml-2">{b.billing_month}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="outline" onClick={onClose}>Abbrechen</Button>
                <Button onClick={handleSave} disabled={!form.customer || !form.project_name}>
                  <CheckCircle2 className="w-4 h-4 mr-2" /> Als Projekt & AB speichern
                </Button>
              </div>
            </div>
          )}

          {/* Step: saving */}
          {step === 'saving' && (
            <div className="text-center py-12 space-y-3">
              <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto" />
              <p className="font-semibold">Wird gespeichert…</p>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && (
            <div className="text-center py-12 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <p className="font-semibold text-lg">Erfolgreich angelegt!</p>
              <p className="text-sm text-muted-foreground">Weiterleitung zur Detailansicht…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}