import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import QuoteItemsEditor from '@/components/crm/quotes/QuoteItemsEditor';
import { QUOTE_STATUS, QUOTE_SOURCE, calcTotals } from '@/components/crm/quotes/quoteConfig';

export default function CrmQuoteDetail() {
  const { quoteId } = useParams();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showSource, setShowSource] = useState(false);

  const { data: quote, isLoading } = useQuery({
    queryKey: ['crm-quote', quoteId],
    queryFn: () => base44.entities.CrmQuote.filter({ id: quoteId }).then(r => r[0] || null),
  });

  useEffect(() => { if (quote && !form) setForm(quote); }, [quote, form]);

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    const totals = calcTotals(form.items, form.vat_rate);
    await base44.entities.CrmQuote.update(quoteId, {
      title: form.title, customer_name: form.customer_name || '',
      contact_name: form.contact_name || '', contact_email: form.contact_email || '',
      quote_number: form.quote_number || '', intro_text: form.intro_text || '',
      items: form.items || [], vat_rate: Number(form.vat_rate) || 20,
      ...totals, status: form.status, valid_until: form.valid_until || null,
      notes: form.notes || '',
    });
    queryClient.invalidateQueries({ queryKey: ['crm-quote', quoteId] });
    queryClient.invalidateQueries({ queryKey: ['crm-quotes'] });
    setSaving(false);
  };

  if (isLoading || !form) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Angebot lädt…</p>;
  }
  if (!quote) {
    return (
      <div className="py-10 text-center space-y-3">
        <p className="text-sm text-muted-foreground">Angebot nicht gefunden.</p>
        <Button variant="outline" asChild><Link to="/crm/quotes">Zur Übersicht</Link></Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/crm/quotes"><ArrowLeft className="w-4 h-4" /></Link>
          </Button>
          <div>
            <h1 className="text-lg font-bold">{form.title}</h1>
            <p className="text-xs text-muted-foreground">
              {QUOTE_SOURCE[quote.source]?.label || quote.source} · erstellt {quote.created_date ? new Date(quote.created_date).toLocaleDateString('de-AT') : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={form.status} onValueChange={v => set('status', v)}>
            <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(QUOTE_STATUS).map(([v, cfg]) => (
                <SelectItem key={v} value={v} className="text-xs">{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Speichern
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Angebotsdaten</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><Label className="text-xs">Angebotsbezeichnung</Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} className="h-8 text-sm mt-1" /></div>
          <div><Label className="text-xs">Angebotsnummer</Label>
            <Input value={form.quote_number || ''} onChange={e => set('quote_number', e.target.value)} placeholder="z.B. AN-2026-001" className="h-8 text-sm mt-1" /></div>
          <div><Label className="text-xs">Kunde / Firma</Label>
            <Input value={form.customer_name || ''} onChange={e => set('customer_name', e.target.value)} className="h-8 text-sm mt-1" /></div>
          <div><Label className="text-xs">Ansprechpartner</Label>
            <Input value={form.contact_name || ''} onChange={e => set('contact_name', e.target.value)} className="h-8 text-sm mt-1" /></div>
          <div><Label className="text-xs">E-Mail</Label>
            <Input value={form.contact_email || ''} onChange={e => set('contact_email', e.target.value)} className="h-8 text-sm mt-1" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Gültig bis</Label>
              <Input type="date" value={form.valid_until || ''} onChange={e => set('valid_until', e.target.value)} className="h-8 text-sm mt-1" /></div>
            <div><Label className="text-xs">MwSt. %</Label>
              <Input type="number" value={form.vat_rate ?? 20} onChange={e => set('vat_rate', Number(e.target.value))} className="h-8 text-sm mt-1" /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Anschreiben</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={form.intro_text || ''} onChange={e => set('intro_text', e.target.value)}
            placeholder="Einleitungstext des Angebots…" className="text-sm min-h-[100px]" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Positionen</CardTitle></CardHeader>
        <CardContent>
          <QuoteItemsEditor items={form.items || []} vatRate={Number(form.vat_rate) || 20}
            onChange={items => set('items', items)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Interne Notizen</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)}
            placeholder="Nur intern sichtbar…" className="text-sm min-h-[70px]" />
        </CardContent>
      </Card>

      {quote.source_text && (
        <Card>
          <CardHeader className="pb-2">
            <button onClick={() => setShowSource(s => !s)} className="flex items-center justify-between w-full text-left">
              <CardTitle className="text-base flex items-center gap-2">
                Original-Input <Badge variant="outline" className="text-xs font-normal">{QUOTE_SOURCE[quote.source]?.label}</Badge>
              </CardTitle>
              {showSource ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
          </CardHeader>
          {showSource && (
            <CardContent>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{quote.source_text}</p>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}