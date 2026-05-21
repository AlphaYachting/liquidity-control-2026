import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Settings as SettingsIcon, User, Shield, Clock } from 'lucide-react';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DataTable from '@/components/shared/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function Settings() {
  const { data: auditLogs = [] } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => base44.entities.AuditLog.list('-created_date', 50)
  });

  const logColumns = [
    { key: 'created_date', label: 'Datum', render: (v) => v ? new Date(v).toLocaleString('de-AT') : '—' },
    { key: 'action', label: 'Aktion', render: (v) => <Badge variant="outline">{v}</Badge> },
    { key: 'entity_type', label: 'Entität' },
    { key: 'created_by', label: 'Benutzer' },
    { key: 'details', label: 'Details', render: (v) => <span className="text-xs text-muted-foreground truncate max-w-[250px] block">{v || '—'}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Settings & Mapping" subtitle="Systemkonfiguration" icon={SettingsIcon} />

      <Tabs defaultValue="audit">
        <TabsList>
          <TabsTrigger value="audit"><Clock className="w-4 h-4 mr-1" />Audit Log</TabsTrigger>
          <TabsTrigger value="roles"><Shield className="w-4 h-4 mr-1" />Rollen</TabsTrigger>
          <TabsTrigger value="mapping"><SettingsIcon className="w-4 h-4 mr-1" />Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="mt-4">
          <DataTable columns={logColumns} data={auditLogs} emptyText="Noch keine Audit-Einträge vorhanden" />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Rollenberechtigung</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { role: 'Admin', access: 'Vollzugriff auf alle Bereiche inkl. Import & Einstellungen', color: 'bg-red-100 text-red-700' },
                  { role: 'Management', access: 'Dashboard, Forecast, alle Übersichten, keine Import-Funktion', color: 'bg-blue-100 text-blue-700' },
                  { role: 'Project Management', access: 'Projekte, OM, Produktion & Support, keine Finanzdaten', color: 'bg-amber-100 text-amber-700' },
                  { role: 'Finance', access: 'Forderungen, Verbindlichkeiten, Toolkosten, Forecast', color: 'bg-emerald-100 text-emerald-700' },
                  { role: 'Read-only', access: 'Dashboard nur, keine Bearbeitung', color: 'bg-gray-100 text-gray-600' },
                ].map(r => (
                  <div key={r.role} className="flex items-center justify-between p-4 border rounded-xl">
                    <div className="flex items-center gap-3">
                      <Badge className={r.color}>{r.role}</Badge>
                      <span className="text-sm text-muted-foreground">{r.access}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mapping" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Sheet → Entity Mapping</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[
                  { sheet: 'Projekte 2026', entity: 'LiquidityProject' },
                  { sheet: 'OM- Laufende Umsetzung 2026', entity: 'RecurringContract (online_marketing)' },
                  { sheet: 'Wartungsverträge 2026', entity: 'RecurringContract (maintenance)' },
                  { sheet: 'Produktion & Support 2026', entity: 'LiquidityPlanLine (production_support)' },
                  { sheet: 'TOOLKOSTEN 2026', entity: 'ToolCost' },
                  { sheet: 'Mahnliste / N_Mahnliste', entity: 'Receivable' },
                  { sheet: 'Eingangsrechnungen laufend', entity: 'Payable' },
                  { sheet: 'Forecast', entity: 'CashScenario' },
                ].map(m => (
                  <div key={m.sheet} className="flex items-center gap-3 p-3 bg-muted rounded-lg text-sm">
                    <span className="font-medium min-w-[250px]">{m.sheet}</span>
                    <span className="text-muted-foreground">→</span>
                    <Badge variant="outline">{m.entity}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}