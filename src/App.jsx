import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from '@/components/layout/AppLayout';
import AdminRoute from '@/components/layout/AdminRoute';
import Dashboard from '@/pages/Dashboard';
import MyDay from '@/pages/MyDay';
import Projects from '@/pages/Projects';
import OnlineMarketing from '@/pages/OnlineMarketing';
import Maintenance from '@/pages/Maintenance';
import Production from '@/pages/Production';
import Tools from '@/pages/Tools';
import Receivables from '@/pages/Receivables';
import Payables from '@/pages/Payables';
import Forecast from '@/pages/Forecast';
import SefTest from '@/pages/SefTest';
import ImportCenter from '@/pages/ImportCenter';
import Settings from '@/pages/Settings';
import ProjectDetail from '@/pages/ProjectDetail';
import InvoiceReady from '@/pages/InvoiceReady';
import ConfirmedOrders from '@/pages/ConfirmedOrders';
import ConfirmedOrderDetail from '@/pages/ConfirmedOrderDetail';
import InvoiceMatchingReview from '@/pages/InvoiceMatchingReview';
import NextMonthForecast from '@/pages/NextMonthForecast';
import AworkSettings from '@/pages/AworkSettings';
import AworkMappingReview from '@/pages/AworkMappingReview';
import PaymentConsistencyCheck from '@/pages/PaymentConsistencyCheck';
import SevdeskSettings from '@/pages/SevdeskSettings';
import CashflowAdvisor from '@/pages/CashflowAdvisor';
import RevenueAnalysis from '@/pages/RevenueAnalysis';
import AworkCostIndex from '@/pages/AworkCostIndex';
import EscalationAlerts from '@/pages/EscalationAlerts';
import WeeklyCashflow from '@/pages/WeeklyCashflow';
import CustomerRisk from '@/pages/CustomerRisk';
import VarianceAnalysis from '@/pages/VarianceAnalysis';
import MasterDataImport from '@/pages/MasterDataImport';
import BillingDataReset from '@/pages/BillingDataReset';
import OperationalReset from '@/pages/OperationalReset';
import SevdeskReimport from '@/pages/SevdeskReimport';
import Hosting from '@/pages/Hosting';
import CrmBoard from '@/pages/CrmBoard';
import CrmInbox from '@/pages/CrmInbox';
import CrmDealDetail from '@/pages/CrmDealDetail';
import CrmQuotes from '@/pages/CrmQuotes';
import CrmProposals from '@/pages/CrmProposals';
import CrmEmails from '@/pages/CrmEmails';
import CrmEscalations from '@/pages/CrmEscalations';
import CrmProposalDetail from '@/pages/CrmProposalDetail';
import CrmQuoteDetail from '@/pages/CrmQuoteDetail';
import AuditTrail from '@/pages/AuditTrail';
import RestructuringLayout from '@/components/restructuring/RestructuringLayout';
import RestructuringCockpit from '@/pages/RestructuringCockpit';
import Restructuring13Week from '@/pages/Restructuring13Week';
import RestructuringPlan from '@/pages/RestructuringPlan';
import RestructuringSollIst from '@/pages/RestructuringSollIst';
import RestructuringFortfuehrung from '@/pages/RestructuringFortfuehrung';
import RestructuringForecast from '@/pages/RestructuringForecast';
import RestructuringAging from '@/pages/RestructuringAging';
import RestructuringBacklog from '@/pages/RestructuringBacklog';
import RestructuringWip from '@/pages/RestructuringWip';
import RestructuringCoverage from '@/pages/RestructuringCoverage';
import RestructuringSetup from '@/pages/RestructuringSetup';
import SprintHeute from '@/pages/sprint/SprintHeute';
import SprintUebersicht from '@/pages/sprint/SprintUebersicht';
import SprintProjekte from '@/pages/sprint/SprintProjekte';
import SprintModulKatalog from '@/pages/sprint/SprintModulKatalog';
import SprintAssistent from '@/pages/sprint/SprintAssistent';
import SprintDetail from '@/pages/sprint/SprintDetail';
import SprintMilestoneDetail from '@/pages/sprint/SprintMilestoneDetail';
import SprintPlanung from '@/pages/sprint/SprintPlanung';
import SprintSteuerung from '@/pages/sprint/SprintSteuerung';
import SprintRechnungsuebergabe from '@/pages/sprint/SprintRechnungsuebergabe';
import MasseverwalterReport from '@/pages/MasseverwalterReport';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  // Öffentlicher Masseverwalter-Bericht — ohne Login erreichbar, vor jeder Auth-Prüfung
  if (window.location.pathname.startsWith('/masseverwalter')) {
    return (
      <Routes>
        <Route path="/masseverwalter/:accessKey" element={<MasseverwalterReport />} />
        <Route path="*" element={<PageNotFound />} />
      </Routes>
    );
  }

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-muted border-t-primary rounded-full animate-spin mx-auto"></div>
          <p className="mt-4 text-sm text-muted-foreground">Liquidity Control lädt...</p>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<MyDay />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/confirmed-orders" element={<ConfirmedOrders />} />
        <Route path="/confirmed-orders/:orderId" element={<ConfirmedOrderDetail />} />
        <Route path="/invoice-matching" element={<AdminRoute><InvoiceMatchingReview /></AdminRoute>} />
        <Route path="/next-month-forecast" element={<NextMonthForecast />} />
        <Route path="/invoice-ready" element={<InvoiceReady />} />
        <Route path="/online-marketing" element={<OnlineMarketing />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/hosting" element={<Hosting />} />
        <Route path="/crm" element={<CrmBoard />} />
        <Route path="/crm/inbox" element={<CrmInbox />} />
        <Route path="/crm/emails" element={<CrmEmails />} />
        <Route path="/crm/escalations" element={<CrmEscalations />} />
        <Route path="/crm/deals/:dealId" element={<CrmDealDetail />} />
        <Route path="/crm/quotes" element={<CrmQuotes />} />
        <Route path="/crm/quotes/:quoteId" element={<CrmQuoteDetail />} />
        <Route path="/crm/proposals" element={<CrmProposals />} />
        <Route path="/crm/proposals/:proposalId" element={<CrmProposalDetail />} />
        <Route path="/production" element={<Production />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/receivables" element={<Receivables />} />
        <Route path="/payables" element={<Payables />} />
        <Route path="/forecast" element={<Forecast />} />
        <Route path="/seftest" element={<SefTest />} />
        <Route path="/import" element={<AdminRoute><ImportCenter /></AdminRoute>} />
        <Route path="/settings" element={<AdminRoute><Settings /></AdminRoute>} />
        <Route path="/awork-settings" element={<AdminRoute><AworkSettings /></AdminRoute>} />
        <Route path="/awork-mapping" element={<AdminRoute><AworkMappingReview /></AdminRoute>} />
        <Route path="/payment-consistency" element={<PaymentConsistencyCheck />} />
        <Route path="/sevdesk-settings" element={<AdminRoute><SevdeskSettings /></AdminRoute>} />
        <Route path="/cashflow-advisor" element={<CashflowAdvisor />} />
        <Route path="/revenue-analysis" element={<RevenueAnalysis />} />
        <Route path="/awork-cost-index" element={<AworkCostIndex />} />
        <Route path="/escalation-alerts" element={<EscalationAlerts />} />
        <Route path="/weekly-cashflow" element={<WeeklyCashflow />} />
        <Route path="/customer-risk" element={<CustomerRisk />} />
        <Route path="/variance-analysis" element={<VarianceAnalysis />} />
        <Route path="/master-import" element={<AdminRoute><MasterDataImport /></AdminRoute>} />
        <Route path="/billing-reset" element={<AdminRoute><BillingDataReset /></AdminRoute>} />
        <Route path="/operational-reset" element={<AdminRoute><OperationalReset /></AdminRoute>} />
        <Route path="/sevdesk-reimport" element={<AdminRoute><SevdeskReimport /></AdminRoute>} />
        <Route path="/audit-trail" element={<AdminRoute><AuditTrail /></AdminRoute>} />
        <Route path="/sprint" element={<SprintHeute />} />
        <Route path="/sprint/uebersicht" element={<SprintUebersicht />} />
        <Route path="/sprint/projekte" element={<SprintProjekte />} />
        <Route path="/sprint/katalog" element={<SprintModulKatalog />} />
        <Route path="/sprint/neu" element={<SprintAssistent />} />
        <Route path="/sprint/sprints/:sprintId" element={<SprintDetail />} />
        <Route path="/sprint/milestones/:milestoneId" element={<SprintMilestoneDetail />} />
        <Route path="/sprint/planung" element={<SprintPlanung />} />
        <Route path="/sprint/steuerung" element={<SprintSteuerung />} />
        <Route path="/sprint/rechnungsuebergabe" element={<SprintRechnungsuebergabe />} />
        <Route path="/restructuring" element={<AdminRoute><RestructuringLayout /></AdminRoute>}>
          <Route index element={<RestructuringCockpit />} />
          <Route path="liquidity" element={<Restructuring13Week />} />
          <Route path="plan" element={<RestructuringPlan />} />
          <Route path="soll-ist" element={<RestructuringSollIst />} />
          <Route path="fortfuehrung" element={<RestructuringFortfuehrung />} />
          <Route path="forecast" element={<RestructuringForecast />} />
          <Route path="aging" element={<RestructuringAging />} />
          <Route path="backlog" element={<RestructuringBacklog />} />
          <Route path="wip" element={<RestructuringWip />} />
          <Route path="coverage" element={<RestructuringCoverage />} />
          <Route path="setup" element={<RestructuringSetup />} />
        </Route>
      </Route>
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App