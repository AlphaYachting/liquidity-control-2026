import React, { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import PageHeader from '@/components/shared/PageHeader';
import {
  RefreshCw, FileText, ShoppingCart, CheckCircle, AlertCircle,
  Clock, Trash2, Download, Filter, ChevronDown, ChevronUp
} from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2];

function formatCurrency(val) {
  return new Intl.NumberFormat('de-AT', { style: 'currency', currency: 'EUR' }).format(val || 0);
}

// ─── Order Selector Component ──────────────────────────────────────────────
function OrderSelector({ onImportDone }) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [selectAll, setSelectAll] = useState(false);

  const { data: ordersData, isLoading, refetch } = useQuery({
    queryKey: ['sevdesk-orders-list', year],
    queryFn: async () => {
      const res = await base44.functions.invoke('listSevdeskOrders', { year });
      return res.data?.orders || [];
    },
    enabled: true,
  });

  const orders = ordersData || [];

  const toggleOrder = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = (checked) => {
    setSelectAll(checked);
    if (checked) {
      setSelectedIds(new Set(orders.map(o => o.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    setImportResult(null);
    try {
      const res = await base44.functions.invoke('syncSevdeskOrders', {
        selectedIds: Array.from(selectedIds),
        includeOrderItems: true,
      });
      setImportResult({ success: true, data: res.data });
      onImportDone?.();
    } catch (e) {
      setImportResult({ success: false, error: e.message });
    } finally {
      setImporting(false);
    }
  };

  const statusLabel = (status) => {
    if (status === '750') return { label: 'Angenommen', color: 'bg-emerald-100 text-emerald-700' };
    if (status === '500') return { label: 'Offen', color: 'bg-blue-100 text-blue-700' };
    if (status === '200') return { label: 'Bestätigt', color: 'bg-indigo-100 text-indigo-700' };
    if (status === '1000') return { label: 'Abgeschlossen', color: 'bg-gray-100 text-gray-600' };
    return { label: `Status ${status}`, color: 'bg-gray-100 text-gray-500' };
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShoppingCart className="w-5 h-5 text-primary" />
          Auftragsbestätigungen importieren
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Wähle die Auftragsbestätigungen aus, die du importieren möchtest. Auftragspositionen werden automatisch mitimportiert.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Year Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Jahr:</span>
          {YEARS.map(y => (
            <Button
              key={y}
              size="sm"
              variant={year === y ? 'default' : 'outline'}
              onClick={() => { setYear(y); setSelectedIds(new Set()); setSelectAll(false); }}
            >
              {y}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="ml-auto">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Neu laden
          </Button>
        </div>

        {/* Order List */}
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <RefreshCw className="w-4 h-4 animate-spin" /> Lade Aufträge aus sevDesk...
          </div>
        ) : orders.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Keine Aufträge für {year} gefunden.</p>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            {/* Select All Header */}
            <div className="flex items-center gap-3 px-3 py-2 bg-muted border-b">
              <Checkbox
                checked={selectAll}
                onCheckedChange={handleSelectAll}
                id="select-all"
              />
              <label htmlFor="select-all" className="text-xs font-medium cursor-pointer">
                Alle auswählen ({orders.length} Aufträge)
              </label>
              {selectedIds.size > 0 && (
                <Badge className="ml-auto text-xs">{selectedIds.size} ausgewählt</Badge>
              )}
            </div>

            {/* Orders */}
            <div className="divide-y max-h-96 overflow-y-auto">
              {orders.map(order => {
                const st = statusLabel(order.status);
                return (
                  <div
                    key={order.id}
                    className={`flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors ${selectedIds.has(order.id) ? 'bg-primary/5' : ''}`}
                    onClick={() => toggleOrder(order.id)}
                  >
                    <Checkbox
                      checked={selectedIds.has(order.id)}
                      onCheckedChange={() => toggleOrder(order.id)}
                      onClick={e => e.stopPropagation()}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{order.customer}</p>
                      <p className="text-xs text-muted-foreground truncate">{order.order_number}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-semibold">{formatCurrency(order.total_net)}</span>
                      <div className="flex items-center gap-1">
                        <Badge className={`text-xs px-1.5 py-0 ${st.color}`}>{st.label}</Badge>
                        <span className="text-xs text-muted-foreground">{order.order_date}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Import Result */}
        {importResult && (
          <div className={`p-3 rounded-lg text-sm ${importResult.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            <div className="flex items-center gap-2 font-medium mb-1">
              {importResult.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {importResult.success ? 'Import erfolgreich' : 'Fehler'}
            </div>
            {importResult.success ? (
              <div className="space-y-0.5 text-xs">
                <p>Aufträge importiert: <strong>{importResult.data?.created ?? 0} neu, {importResult.data?.updated ?? 0} aktualisiert</strong></p>
                <p>Auftragspositionen: <strong>{importResult.data?.itemsCreated ?? 0}</strong></p>
              </div>
            ) : (
              <p className="text-xs">{importResult.error}</p>
            )}
          </div>
        )}

        {/* Import Button */}
        <Button
          onClick={handleImport}
          disabled={importing || selectedIds.size === 0}
          className="w-full"
        >
          {importing ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Importiere {selectedIds.size} Aufträge...</>
          ) : (
            <><Download className="w-4 h-4 mr-2" />
              {selectedIds.size > 0
                ? `${selectedIds.size} Aufträge importieren (inkl. Positionen)`
                : 'Aufträge auswählen'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Invoice Sync Component ─────────────────────────────────────────────────
function InvoiceSync({ onImportDone }) {
  const [year, setYear] = useState(CURRENT_YEAR);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('syncSevdeskInvoices', { year, limit: 500 });
      setResult({ success: true, data: res.data });
      onImportDone?.();
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
          <FileText className="w-5 h-5 text-primary" />
          Rechnungen synchronisieren
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Importiert alle Rechnungen aus sevDesk für das gewählte Jahr.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Jahr:</span>
          {YEARS.map(y => (
            <Button
              key={y}
              size="sm"
              variant={year === y ? 'default' : 'outline'}
              onClick={() => setYear(y)}
            >
              {y}
            </Button>
          ))}
        </div>

        {result && (
          <div className={`p-3 rounded-lg text-sm ${result.success ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
            <div className="flex items-center gap-2 font-medium mb-1">
              {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {result.success ? 'Sync erfolgreich' : 'Fehler'}
            </div>
            {result.success ? (
              <div className="space-y-0.5 text-xs">
                <p>Abgerufen: <strong>{result.data?.fetched ?? '—'}</strong></p>
                <p>Neu: <strong>{result.data?.created ?? '—'}</strong> · Aktualisiert: <strong>{result.data?.updated ?? '—'}</strong></p>
                {result.data?.failed > 0 && <p className="text-amber-700">Fehler: <strong>{result.data.failed}</strong></p>}
              </div>
            ) : (
              <p className="text-xs">{result.error}</p>
            )}
          </div>
        )}

        <Button onClick={handleSync} disabled={loading} className="w-full">
          {loading ? (
            <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Synchronisiere {year}...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" />Rechnungen {year} synchronisieren</>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────
export default function SevdeskSettings() {
  const queryClient = useQueryClient();

  const { data: invoiceCount = 0, refetch: refetchInvoices } = useQuery({
    queryKey: ['sevdesk-invoice-count'],
    queryFn: async () => {
      const items = await base44.entities.InvoiceRecord.filter({ source_type: 'sevdesk' });
      return items.length;
    }
  });

  const { data: orderCount = 0, refetch: refetchOrders } = useQuery({
    queryKey: ['sevdesk-order-count'],
    queryFn: async () => {
      const items = await base44.entities.ConfirmedOrder.filter({ source_type: 'sevdesk' });
      return items.length;
    }
  });

  const handleImportDone = useCallback(() => {
    refetchInvoices();
    refetchOrders();
    queryClient.invalidateQueries({ queryKey: ['confirmed-orders'] });
    queryClient.invalidateQueries({ queryKey: ['invoice-records'] });
  }, [refetchInvoices, refetchOrders, queryClient]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="sevDesk Integration"
        subtitle="Selektiver Import von Auftragsbestätigungen und Rechnungen"
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
              <p className="text-sm text-muted-foreground">Rechnungen importiert</p>
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
              <p className="text-sm text-muted-foreground">Aufträge importiert</p>
              <p className="font-bold text-lg">{orderCount}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Import Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <OrderSelector onImportDone={handleImportDone} />
        <InvoiceSync onImportDone={handleImportDone} />
      </div>

      {/* Auto Sync Info */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            <Badge className="bg-emerald-100 text-emerald-700">Aktiv</Badge>
            <p className="text-sm text-muted-foreground">
              Automatische Synchronisierung läuft <strong>alle 6 Stunden</strong> im Hintergrund.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}