import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/shared/PageHeader';
import { GitMerge, Search, CheckCircle2, XCircle, Minus, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

function matchConfidence(aworkProject, confirmedOrders, projects) {
  let best = { score: 0, order: null, project: null, reasons: [] };

  for (const order of confirmedOrders) {
    let score = 0;
    const reasons = [];

    // +40: project key / order number exact match
    const pKey = (aworkProject.project_key || '').toLowerCase().trim();
    const oNum = (order.order_number || '').toLowerCase().trim();
    if (pKey && oNum && (pKey === oNum || pKey.includes(oNum) || oNum.includes(pKey))) {
      score += 40; reasons.push('Auftragsnr. übereinstimmend (+40)');
    }

    // +25: company name similarity
    const aCompany = (aworkProject.company_name || '').toLowerCase();
    const oCustomer = (order.customer || '').toLowerCase();
    if (aCompany && oCustomer) {
      const sim = simpleSimilarity(aCompany, oCustomer);
      if (sim >= 0.85) { score += 25; reasons.push(`Kundenname ähnlich (${Math.round(sim * 100)}%, +25)`); }
      else if (sim >= 0.6) { score += 10; reasons.push(`Kundenname teilw. ähnlich (+10)`); }
    }

    // +20: project title similarity
    const aName = (aworkProject.name || '').toLowerCase();
    const oProjName = (order.project_name || '').toLowerCase();
    if (aName && oProjName) {
      const sim = simpleSimilarity(aName, oProjName);
      if (sim >= 0.8) { score += 20; reasons.push(`Projektname ähnlich (+20)`); }
      else if (sim >= 0.5) { score += 8; reasons.push(`Projektname teilw. ähnlich (+8)`); }
    }

    // +10: PM email
    const aPM = (aworkProject.responsible_user_email || '').toLowerCase();
    const oPM = (order.responsible_project_manager || '').toLowerCase();
    if (aPM && oPM && aPM === oPM) { score += 10; reasons.push('PM-E-Mail übereinstimmend (+10)'); }

    if (score > best.score) {
      best = { score, order, project: projects.find(p => p.id === order.project_id) || null, reasons };
    }
  }
  return best;
}

function simpleSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}

function ConfidenceBadge({ score }) {
  if (score >= 70) return <Badge className="bg-emerald-100 text-emerald-700">{score} — Hoch</Badge>;
  if (score >= 40) return <Badge className="bg-amber-100 text-amber-700">{score} — Prüfen</Badge>;
  return <Badge className="bg-red-100 text-red-700">{score} — Offen</Badge>;
}

export default function AworkMappingReview() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const { data: snapshots = [], isLoading: snapshotsLoading } = useQuery({
    queryKey: ['awork-project-snapshots'],
    queryFn: () => base44.entities.AworkProjectSnapshot.list('-last_synced_at', 200)
  });

  const { data: orders = [] } = useQuery({
    queryKey: ['confirmedOrders'],
    queryFn: () => base44.entities.ConfirmedOrder.list()
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['liquidityProjects'],
    queryFn: () => base44.entities.LiquidityProject.list()
  });

  const saveOrderMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ConfirmedOrder.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['confirmedOrders'] })
  });

  const rows = useMemo(() => {
    return snapshots
      .filter(p => !p.is_archived)
      .map(snapshot => {
        const alreadyMapped = orders.find(o => o.awork_project_id === snapshot.awork_project_id);
        const match = alreadyMapped
          ? { score: 100, order: alreadyMapped, project: projects.find(p => p.id === alreadyMapped.project_id) || null, reasons: ['Manuell verknüpft'] }
          : matchConfidence(snapshot, orders, projects);
        return { snapshot, match, alreadyMapped };
      });
  }, [snapshots, orders, projects]);

  const filtered = rows.filter(({ snapshot, match }) => {
    const searchMatch = !search ||
      snapshot.name.toLowerCase().includes(search.toLowerCase()) ||
      (snapshot.company_name || '').toLowerCase().includes(search.toLowerCase());
    const filterMatch = filter === 'all' ||
      (filter === 'mapped' && !!snapshot.awork_project_id && orders.find(o => o.awork_project_id === snapshot.awork_project_id)) ||
      (filter === 'high' && match.score >= 70 && !orders.find(o => o.awork_project_id === snapshot.awork_project_id)) ||
      (filter === 'review' && match.score >= 40 && match.score < 70) ||
      (filter === 'unmatched' && match.score < 40);
    return searchMatch && filterMatch;
  });

  const handleConfirmMapping = async (snapshot, order) => {
    await saveOrderMutation.mutateAsync({
      id: order.id,
      data: {
        awork_project_id: snapshot.awork_project_id,
        awork_project_name: snapshot.name,
        awork_project_status: snapshot.project_status,
        awork_progress_percent: snapshot.progress_percent,
        awork_match_status: 'manual',
        awork_last_synced_at: new Date().toISOString()
      }
    });
  };

  const handleIgnore = async (order) => {
    await saveOrderMutation.mutateAsync({
      id: order.id,
      data: { awork_match_status: 'ignored' }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="awork Projekt-Mapping"
        subtitle="awork Projekte mit Auftragsbestätigungen verknüpfen"
        icon={GitMerge}
      />

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Projekt suchen..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        {['all', 'mapped', 'high', 'review', 'unmatched'].map(f => (
          <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)}>
            {{ all: 'Alle', mapped: 'Verknüpft', high: 'Hoch', review: 'Prüfen', unmatched: 'Offen' }[f]}
          </Button>
        ))}
      </div>

      {snapshotsLoading ? (
        <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Keine Projekte gefunden. Bitte zuerst awork Sync durchführen.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ snapshot, match, alreadyMapped }) => {
            const isMapped = !!alreadyMapped;
            return (
              <Card key={snapshot.id} className={isMapped ? 'border-emerald-200' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* awork project info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-xs font-bold">a</span>
                        </div>
                        <p className="font-semibold text-sm truncate">{snapshot.name}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {snapshot.company_name && <span className="text-xs text-muted-foreground">{snapshot.company_name}</span>}
                        {snapshot.project_status && (
                          <Badge className="bg-gray-100 text-gray-600 text-xs">{snapshot.project_status}</Badge>
                        )}
                        {snapshot.progress_percent > 0 && (
                          <span className="text-xs text-muted-foreground">{snapshot.progress_percent}%</span>
                        )}
                        {snapshot.responsible_user_name && (
                          <span className="text-xs text-muted-foreground">PM: {snapshot.responsible_user_name}</span>
                        )}
                      </div>
                    </div>

                    {/* Arrow */}
                    <div className="flex items-center text-muted-foreground flex-shrink-0 mt-1">→</div>

                    {/* Suggested match */}
                    <div className="flex-1 min-w-0">
                      {isMapped ? (
                        <div>
                          <p className="text-xs text-emerald-600 font-medium mb-0.5">✓ Verknüpft</p>
                          <p className="font-medium text-sm">{alreadyMapped.project_name}</p>
                          <p className="text-xs text-muted-foreground">{alreadyMapped.customer}</p>
                          {alreadyMapped.order_number && <p className="text-xs text-muted-foreground">#{alreadyMapped.order_number}</p>}
                        </div>
                      ) : match.order ? (
                        <div>
                          <p className="text-xs text-muted-foreground mb-0.5">Vorschlag:</p>
                          <p className="font-medium text-sm">{match.order.project_name}</p>
                          <p className="text-xs text-muted-foreground">{match.order.customer}</p>
                          {match.reasons.slice(0, 2).map((r, i) => (
                            <p key={i} className="text-xs text-muted-foreground">{r}</p>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Kein passender Auftrag gefunden</p>
                      )}
                    </div>

                    {/* Confidence + Actions */}
                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                      {!isMapped && <ConfidenceBadge score={match.score} />}
                      {isMapped && <Badge className="bg-emerald-100 text-emerald-700">Verknüpft</Badge>}
                      <div className="flex gap-1">
                        {!isMapped && match.order && match.order.awork_match_status !== 'ignored' && (
                          <Button size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => handleConfirmMapping(snapshot, match.order)}>
                            <CheckCircle2 className="w-3 h-3 mr-1" /> Bestätigen
                          </Button>
                        )}
                        {isMapped && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => navigate(`/confirmed-orders/${alreadyMapped.id}`)}>
                            Öffnen →
                          </Button>
                        )}
                        {!isMapped && match.order && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground"
                            onClick={() => handleIgnore(match.order)}>
                            <XCircle className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}