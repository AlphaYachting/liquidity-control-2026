import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useUserScope } from '@/lib/useUserScope';
import { useEmailEscalations } from '@/hooks/useEmailEscalations';
import { isClosedStage } from '@/components/crm/stages';

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Baut die Arbeitslisten für "Mein Tag" — gefiltert auf die Zuständigkeit des Nutzers.
export function useMyDayQueues() {
  const scope = useUserScope();

  const { data: projects = [], isLoading: lp } = useQuery({
    queryKey: ['myday-projects'],
    queryFn: () => base44.entities.LiquidityProject.filter({ is_active_for_billing: true }, '-updated_date', 500),
  });

  const { data: instructions = [], isLoading: li } = useQuery({
    queryKey: ['myday-instructions'],
    queryFn: () => base44.entities.BillingInstruction.list('-created_date', 300),
  });

  const { data: plans = [], isLoading: lpl } = useQuery({
    queryKey: ['myday-plans', currentMonth()],
    queryFn: () => base44.entities.MonthlyBillingPlan.filter({ planning_month: currentMonth() }, '-updated_date', 300),
  });

  const { data: dunning = [], isLoading: ld } = useQuery({
    queryKey: ['myday-dunning'],
    queryFn: () => base44.entities.DunningRecord.filter({ status: 'draft_created' }, '-created_date', 100),
  });

  const { data: deals = [], isLoading: ldl } = useQuery({
    queryKey: ['myday-deals'],
    queryFn: () => base44.entities.CrmDeal.list('-created_date', 300),
  });

  const { data: escalations = [], isLoading: le } = useEmailEscalations();

  // Projekt-Zuordnung: Welche Projekte und Kunden gehören mir?
  const myProjects = projects.filter((p) => scope.isMine(p.project_manager));
  const myProjectIds = new Set(myProjects.map((p) => p.id));
  const myCustomers = new Set(myProjects.map((p) => String(p.customer || '').toLowerCase()).filter(Boolean));

  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));
  const belongsToMe = (projectId, pmName) =>
    scope.seesAll || myProjectIds.has(projectId) || scope.isMineStrict(pmName || projectById[projectId]?.project_manager);

  return {
    isLoading: lp || li || lpl || ld || ldl || le,
    scope,
    myProjectCount: myProjects.length,

    // Fortschritt noch nicht validiert — blockiert die Abrechnung
    progressToCheck: myProjects.filter((p) => !p.real_progress_checked && (p.awork_progress_percent || 0) >= 50),

    // Projekte mit Risiko in meiner Verantwortung
    riskProjects: myProjects.filter((p) => ['high', 'critical'].includes(p.risk_status)),

    // Abrechnungsanweisungen, die noch nicht beim Backoffice sind
    openInstructions: instructions.filter(
      (i) => ['draft', 'ready_for_backoffice'].includes(i.status) && belongsToMe(i.project_id, i.requested_by_pm)
    ),

    // Abrechnungsplanung dieses Monats, die noch offen ist
    plansToReview: plans.filter(
      (p) => ['open', 'planned', 'in_review'].includes(p.billing_status) && belongsToMe(p.project_id, p.assigned_pm)
    ),

    // Backoffice: Mahnfreigaben
    dunningDrafts: scope.hasArea('backoffice') ? dunning : [],

    // Sales: neue, noch nie geöffnete Leads
    newDeals: scope.hasArea('sales') ? deals.filter((d) => !d.seen_at && !isClosedStage(d.stage)) : [],

    // Kommunikation: Eskalationen zu meinen Kunden
    escalations: (escalations || []).filter(
      (t) => scope.seesAll || myCustomers.has(String(t.customer || '').toLowerCase())
    ),
  };
}