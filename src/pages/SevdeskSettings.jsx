import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageHeader from '@/components/shared/PageHeader';
import { RefreshCw, FileText, ShoppingCart, CheckCircle, AlertCircle, Clock } from 'lucide-react';

function SyncCard({ title, icon: Icon, description, onSync, lastResult }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(lastResult || null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await onSync();
      setResult({ success: true, data: res.data });
    } catch (e) {
      setResult({ success: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="w-5 h-5 text-primary" />
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {result && (
          <div className={`p-3 rounded-lg text-sm ${result.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            <div className="flex items-center gap-2 font-medium mb-1">
              {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {result.success ? 'Sync erfolgreich' : 'Fehler'}
            </div>
            {result.success ? (
              <div className="space-y-0.5 text-xs">
                <p>Abgerufen: <strong>{result.data?.fetched ?? '—'}</strong></p>
                <p>Neu erstellt: <strong>{result.data?.created ?? '—'}</strong></p>
                <p>Aktualisiert: <strong>{result.data?.updated ?? '—'}</strong></p>
                {result.data?.failed > 0 && <p className="text-amber-700">Fehler: <strong>{result.data.failed}</strong></p>}
              </div>
            ) : (
              <p className="text-xs">{result.error}</p>
            )}
          </div>
        )}
        <Button onClick={handleSync} disabled={loading} className="w-full">
          {loading ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Synchronisiere...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" />Jetzt synchronisieren</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SevdeskSettings() {
  const { data: invoiceCount = 0 } = useQuery({
    queryKey: ['sevdesk-invoice-count'],
    queryFn: async () => {
      const items = await base44.entities.InvoiceRecord.filter({ source_type: 'sevdesk' });
      return items.length;
    }
  });

  const { data: orderCount = 0 } = useQuery({
    queryKey: ['sevdesk-order-count'],
    queryFn: async () => {
      const items = await base44.entities.ConfirmedOrder.filter({ source_type: 'sevdesk' });
      return items.length;
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="sevDesk Integration"
        subtitle="Rechnungen und Auftragsbestätigungen aus sevDesk synchronisieren"
        icon={RefreshCw}
      />

      {/* Status Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">API-Verbindung</p>
              <Badge className="bg-emerald-100 text-emerald-700 mt-0.5">Konfiguriert</Badge>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Rechnungen (sevDesk)</p>
              <p className="font-bold text-lg">{invoiceCount}</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aufträge (sevDesk)</p>
              <p className="font-bold text-lg">{orderCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Sync Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <SyncCard
          title="Rechnungen synchronisieren"
          icon={FileText}
          description="Importiert alle Rechnungen aus sevDesk (RE, AN) und speichert sie als InvoiceRecords. Bestehende Rechnungen werden aktualisiert."
          onSync={() => base44.functions.invoke('syncSevdeskInvoices', { limit: 100, offset: 0 })}
        />
        <SyncCard
          title="Auftragsbestätigungen synchronisieren"
          icon={ShoppingCart}
          description="Importiert Auftragsbestätigungen (AB) und Angebote (AN) aus sevDesk und speichert sie als ConfirmedOrders."
          onSync={() => base44.functions.invoke('syncSevdeskOrders', { limit: 100, offset: 0 })}
        />
      </div>

      {/* Auto Sync Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            Automatische Synchronisierung
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Badge className="bg-emerald-100 text-emerald-700">Aktiv</Badge>
            <p className="text-sm text-muted-foreground">
              Rechnungen und Auftragsbestätigungen werden automatisch <strong>alle 6 Stunden</strong> aus sevDesk synchronisiert.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}