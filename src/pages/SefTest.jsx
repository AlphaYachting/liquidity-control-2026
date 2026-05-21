import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart3, CheckCircle2, XCircle, HelpCircle, Shield } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

const CHECKLIST = [
  'Gibt es offizielle API-Dokumentation?',
  'Erlaubt die API Read-Only Zugriff?',
  'Können offene Forderungen exportiert werden?',
  'Können Eingangsrechnungen exportiert werden?',
  'Kann Zahlungsstatus exportiert werden?',
  'Kann die Verbindung ohne direkten Steuerberater-Zugriff hergestellt werden?',
  'Wird OAuth, API Key, EBICS, CSV oder manueller Export benötigt?',
  'Welche Datenschutzrisiken bestehen?',
  'Ist ein CSV-Fallback möglich?',
];

const STATUS_COLORS = {
  not_checked: 'bg-gray-100 text-gray-600',
  documentation_needed: 'bg-amber-100 text-amber-700',
  sandbox_possible: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  blocked: 'bg-red-100 text-red-700',
};

export default function SefTest() {
  const queryClient = useQueryClient();
  const [checklist, setChecklist] = useState(CHECKLIST.map(q => ({ question: q, answer: null })));
  const [form, setForm] = useState({
    provider_name: 'sevDesk',
    api_available: false,
    api_documentation_url: '',
    authentication_type: 'unknown',
    connection_status: 'not_checked',
    notes: '',
    security_risk_level: 'unknown',
    data_types_needed: ['outgoing_invoices', 'incoming_invoices', 'payments', 'open_receivables'],
  });

  const { data: settings = [] } = useQuery({
    queryKey: ['sefSettings'], queryFn: () => base44.entities.SefIntegrationSetting.list()
  });

  const saveMutation = useMutation({
    mutationFn: (data) => settings.length > 0
      ? base44.entities.SefIntegrationSetting.update(settings[0].id, data)
      : base44.entities.SefIntegrationSetting.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sefSettings'] })
  });

  const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const runChecklist = () => {
    const results = {};
    checklist.forEach((c, i) => { results[`q${i+1}`] = c.answer; });
    saveMutation.mutate({ ...form, checklist_results: results });
  };

  return (
    <div className="space-y-6">
      <PageHeader title="SEFtest / Steuerberater-Schnittstelle" subtitle="Schnittstellenprüfung – Keine aktive Verbindung" icon={BarChart3} />

      <Alert className="border-blue-200 bg-blue-50">
        <Shield className="w-4 h-4 text-blue-600" />
        <AlertDescription className="text-blue-800">
          Diese Seite dient nur der technischen Machbarkeitsprüfung. Es werden keine Credentials gespeichert und keine externen API-Aufrufe durchgeführt.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Provider-Konfiguration</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label className="text-xs">Provider Name</Label><Input value={form.provider_name} onChange={e => update('provider_name', e.target.value)} /></div>
            <div><Label className="text-xs">API Dokumentation URL</Label><Input value={form.api_documentation_url} onChange={e => update('api_documentation_url', e.target.value)} placeholder="https://..." /></div>
            <div>
              <Label className="text-xs">Authentifizierung</Label>
              <Select value={form.authentication_type} onValueChange={v => update('authentication_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['oauth', 'api_key', 'ebics', 'csv_export', 'manual', 'unknown'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Integrationsstatus</Label>
              <Select value={form.connection_status} onValueChange={v => update('connection_status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(STATUS_COLORS).map(v => <SelectItem key={v} value={v}>{v.replace(/_/g, ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Sicherheitsrisiko</Label>
              <Select value={form.security_risk_level} onValueChange={v => update('security_risk_level', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['low', 'medium', 'high', 'unknown'].map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Notizen</Label><Textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} /></div>
            <Badge className={STATUS_COLORS[form.connection_status]}>{form.connection_status.replace(/_/g, ' ')}</Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Technische Machbarkeitscheckliste</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {checklist.map((c, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                <div className="flex gap-1 flex-shrink-0 mt-0.5">
                  <Button size="sm" variant={c.answer === true ? 'default' : 'outline'} className="h-6 w-6 p-0"
                    onClick={() => setChecklist(cl => cl.map((x, j) => j === i ? { ...x, answer: true } : x))}>
                    <CheckCircle2 className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant={c.answer === false ? 'destructive' : 'outline'} className="h-6 w-6 p-0"
                    onClick={() => setChecklist(cl => cl.map((x, j) => j === i ? { ...x, answer: false } : x))}>
                    <XCircle className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant={c.answer === null ? 'secondary' : 'outline'} className="h-6 w-6 p-0"
                    onClick={() => setChecklist(cl => cl.map((x, j) => j === i ? { ...x, answer: null } : x))}>
                    <HelpCircle className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-sm">{c.question}</p>
              </div>
            ))}
            <Button className="w-full mt-4" onClick={runChecklist}>Checkliste speichern & auswerten</Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">CSV Fallback</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">Falls keine API verfügbar ist, kann ein CSV-basierter Import/Export-Prozess eingerichtet werden.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-xl text-center">
              <p className="text-sm font-medium">CSV Import offene Forderungen</p>
              <p className="text-xs text-muted-foreground mt-1">Upload via Import Center</p>
            </div>
            <div className="p-4 border rounded-xl text-center">
              <p className="text-sm font-medium">CSV Import Verbindlichkeiten</p>
              <p className="text-xs text-muted-foreground mt-1">Upload via Import Center</p>
            </div>
            <div className="p-4 border rounded-xl text-center">
              <p className="text-sm font-medium">Monatlicher StB Export</p>
              <p className="text-xs text-muted-foreground mt-1">Manueller Prozess</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}