import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Settings as SettingsIcon, Shield, Clock, Users, Inbox } from 'lucide-react';
import TeamScopeSettings from '@/components/settings/TeamScopeSettings';
import TeamRosterSettings from '@/components/settings/TeamRosterSettings';
import InboxScanSettings from '@/components/settings/InboxScanSettings';
import InboxBlockedSenders from '@/components/settings/InboxBlockedSenders';
import PageHeader from '@/components/shared/PageHeader';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import DataTable from '@/components/shared/DataTable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NAV_GRUPPEN } from '@/lib/navigation';
import { RECHT_LABEL } from '@/lib/useZugriff';

const regelText = (regel) => (Array.isArray(regel) ? regel : [regel]).map((r) => RECHT_LABEL[r] || r).join(' oder ');

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
      <PageHeader title="Einstellungen" subtitle="Systemkonfiguration" icon={SettingsIcon} />

      <Tabs defaultValue="roster">
        <TabsList>
          <TabsTrigger value="roster"><Users className="w-4 h-4 mr-1" />Personen</TabsTrigger>
          <TabsTrigger value="team"><Users className="w-4 h-4 mr-1" />Team & Zuständigkeit</TabsTrigger>
          <TabsTrigger value="inbox"><Inbox className="w-4 h-4 mr-1" />Posteingangs-Prüfung</TabsTrigger>
          <TabsTrigger value="audit"><Clock className="w-4 h-4 mr-1" />Audit Log</TabsTrigger>
          <TabsTrigger value="roles"><Shield className="w-4 h-4 mr-1" />Rollen</TabsTrigger>
          <TabsTrigger value="mapping"><SettingsIcon className="w-4 h-4 mr-1" />Mapping</TabsTrigger>
        </TabsList>

        <TabsContent value="roster" className="mt-4">
          <TeamRosterSettings />
        </TabsContent>

        <TabsContent value="team" className="mt-4">
          <TeamScopeSettings />
        </TabsContent>

        <TabsContent value="inbox" className="mt-4 space-y-4">
          <InboxScanSettings />
          <InboxBlockedSenders />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <DataTable columns={logColumns} data={auditLogs} emptyText="Noch keine Audit-Einträge vorhanden" />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Wer sieht welchen Navigationspunkt</CardTitle>
              <p className="text-xs text-muted-foreground">
                Die Sicht ergibt sich aus der Systemrolle und den Fachrollen (Reiter „Personen“) und den Aufgabenbereichen
                (Reiter „Team &amp; Zuständigkeit“). Diese Tabelle zeigt die geltende Regel je Punkt.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {NAV_GRUPPEN.map((g) => (
                  <div key={g.key}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">{g.titel || 'Tagesarbeit'}</p>
                    <div className="divide-y border rounded-lg">
                      {g.items.map((i) => (
                        <div key={i.path} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="font-medium">{i.label}</span>
                          <span className="text-muted-foreground text-right">{regelText(i.regel)}</span>
                        </div>
                      ))}
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