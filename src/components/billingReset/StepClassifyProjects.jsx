import React, { useMemo, useState } from 'react';
import { ChevronRight, AlertTriangle, CheckCircle2, Archive, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { classifyBillingRelevance, classifyExistingProjectNotInExcel, RELEVANCE_LABELS, RELEVANCE_COLORS } from '@/lib/billingRelevanceUtils';
import { stringSimilarity, normalizeCustomerName } from '@/lib/masterImportUtils';

function findExcelMatch(project, excelRows) {
  const pName = (project.project_name || '').toLowerCase();
  const pCust = normalizeCustomerName(project.customer || '').toLowerCase();
  let best = null;
  for (const row of excelRows) {
    const rName = (row.project_name_normalized || row.project_name_raw || '').toLowerCase();
    const rCust = (row.customer_name_normalized || '').toLowerCase();
    const sim = stringSimilarity(pName, rName) * 0.65 + stringSimilarity(pCust, rCust) * 0.35;
    if (!best || sim > best.sim) best = { row, sim };
  }
  return best && best.sim > 0.45 ? best : null;
}

export default function StepClassifyProjects({ excelRows, existingProjects, existingInvoices, existingOrders, onConfirm }) {
  const [overrides, setOverrides] = useState({});

  const classified = useMemo(() => {
    const excelMatched = new Set();
    const results = [];

    // 1. Excel rows → classify by billing relevance
    excelRows.forEach(row => {
      const rel = classifyBillingRelevance(row);
      const excelMatch = findExcelMatch({ project_name: row.project_name_raw, customer: row.customer_name_normalized }, existingProjects.map(p => ({ project_name: p.project_name, customer: p.customer })));
      // Find best matching project
      let matchedProject = null;
      let bestSim = 0;
      existingProjects.forEach(p => {
        const sim = stringSimilarity((p.project_name||'').toLowerCase(), (row.project_name_raw||'').toLowerCase()) * 0.65
          + stringSimilarity(normalizeCustomerName(p.customer||'').toLowerCase(), (row.customer_name_normalized||'').toLowerCase()) * 0.35;
        if (sim > bestSim && sim > 0.45) { bestSim = sim; matchedProject = p; }
      });
      if (matchedProject) excelMatched.add(matchedProject.id);

      results.push({
        source: 'excel',
        row,
        matchedProject,
        matchSim: bestSim,
        suggestedRelevance: rel.status,
        reasons: rel.reasons,
        projectId: matchedProject?.id || null,
      });
    });

    // 2. Existing projects NOT in Excel
    existingProjects.forEach(p => {
      if (excelMatched.has(p.id)) return;
      const rel = classifyExistingProjectNotInExcel(p, existingInvoices, existingOrders);
      results.push({
        source: 'app_only',
        matchedProject: p,
        suggestedRelevance: rel.status,
        reasons: [rel.reason],
        projectId: p.id,
      });
    });

    return results;
  }, [excelRows, existingProjects, existingInvoices, existingOrders]);

  const grouped = useMemo(() => {
    const groups = { active_billing_relevant: [], future_billing_relevant: [], needs_review: [], inactive: [], archived: [], not_billing_relevant: [] };
    classified.forEach(c => {
      const eff = overrides[c.projectId || c.row?.row_number] || c.suggestedRelevance;
      const key = eff in groups ? eff : 'needs_review';
      groups[key].push({ ...c, effectiveRelevance: eff });
    });
    return groups;
  }, [classified, overrides]);

  function setOverride(key, value) {
    setOverrides(prev => ({ ...prev, [key]: value }));
  }

  function handleConfirm() {
    onConfirm(classified.map(c => {
      const key = c.projectId || c.row?.row_number;
      return { ...c, effectiveRelevance: overrides[key] || c.suggestedRelevance };
    }));
  }

  const RELEVANCE_OPTS = Object.entries(RELEVANCE_LABELS).map(([v, l]) => ({ value: v, label: l }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Schritt 3: Abrechnungsrelevanz klassifizieren</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Projekte aus Excel werden als abrechnungsrelevant eingestuft. App-interne Projekte ohne Excel-Match werden automatisch vorgeschlagen.
          Nichts wird gelöscht — nur die Sichtbarkeit ändert sich.
        </p>
      </div>

      {/* Summary counts */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {Object.entries(grouped).map(([rel, items]) => (
          <div key={rel} className={`rounded-xl p-3 text-center border ${RELEVANCE_COLORS[rel]}`}>
            <p className="text-2xl font-bold">{items.length}</p>
            <p className="text-xs mt-0.5 leading-tight">{RELEVANCE_LABELS[rel]}</p>
          </div>
        ))}
      </div>

      {/* Grouped sections */}
      {Object.entries(grouped).filter(([, items]) => items.length > 0).map(([rel, items]) => (
        <div key={rel}>
          <div className={`flex items-center gap-2 px-3 py-2 rounded-t-xl border-x border-t ${RELEVANCE_COLORS[rel]}`}>
            <span className="text-sm font-semibold">{RELEVANCE_LABELS[rel]}</span>
            <span className="text-xs opacity-70">({items.length})</span>
          </div>
          <div className="border rounded-b-xl overflow-hidden divide-y">
            {items.map((c, i) => {
              const key = c.projectId || c.row?.row_number;
              const label = c.matchedProject?.project_name || c.row?.project_name_raw || '—';
              const customer = c.matchedProject?.customer || c.row?.customer_name_normalized || c.row?.customer_name_raw || '—';
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{label}</p>
                    <p className="text-xs text-muted-foreground">{customer} {c.source === 'app_only' ? '· Nur in App' : '· Excel'}</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{c.reasons.join(' · ')}</p>
                  </div>
                  {c.matchSim > 0 && <span className="text-xs text-muted-foreground flex-shrink-0">{Math.round(c.matchSim * 100)}% Match</span>}
                  <select
                    value={overrides[key] || c.suggestedRelevance}
                    onChange={e => setOverride(key, e.target.value)}
                    onClick={e => e.stopPropagation()}
                    className="text-xs border rounded px-2 py-1 bg-background flex-shrink-0"
                  >
                    {RELEVANCE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <Button onClick={handleConfirm} className="gap-2">
        Klassifizierung bestätigen & weiter
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}