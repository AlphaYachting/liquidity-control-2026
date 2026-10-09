import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import FehlerGrenze from '@/components/FehlerGrenze';

import AppLayout from '@/components/layout/AppLayout';
import AdminRoute from '@/components/layout/AdminRoute';
// Seiten werden erst beim Aufruf geladen — hält den Start der App klein und schnell.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const MyDay = lazy(() => import('@/pages/MyDay'));
const Projects = lazy(() => import('@/pages/Projects'));
const OnlineMarketing = lazy(() => import('@/pages/OnlineMarketing'));
const Maintenance = lazy(() => import('@/pages/Maintenance'));
const Production = lazy(() => import('@/pages/Production'));
const Tools = lazy(() => import('@/pages/Tools'));
const Receivables = lazy(() => import('@/pages/Receivables'));
const Payables = lazy(() => import('@/pages/Payables'));
const Forecast = lazy(() => import('@/pages/Forecast'));
const SefTest = lazy(() => import('@/pages/SefTest'));
const ImportCenter = lazy(() => import('@/pages/ImportCenter'));
const Settings = lazy(() => import('@/pages/Settings'));
const ProjectDetail = lazy(() => import('@/pages/ProjectDetail'));
const InvoiceReady = lazy(() => import('@/pages/InvoiceReady'));
const SupportBilling = lazy(() => import('@/pages/SupportBilling'));
const ConfirmedOrders = lazy(() => import('@/pages/ConfirmedOrders'));
const ConfirmedOrderDetail = lazy(() => import('@/pages/ConfirmedOrderDetail'));
const InvoiceMatchingReview = lazy(() => import('@/pages/InvoiceMatchingReview'));
const NextMonthForecast = lazy(() => import('@/pages/NextMonthForecast'));
const AworkSettings = lazy(() => import('@/pages/AworkSettings'));
const AworkMappingReview = lazy(() => import('@/pages/AworkMappingReview'));
const PaymentConsistencyCheck = lazy(() => import('@/pages/PaymentConsistencyCheck'));
const SevdeskSettings = lazy(() => import('@/pages/SevdeskSettings'));
const CashflowAdvisor = lazy(() => import('@/pages/CashflowAdvisor'));
const RevenueAnalysis = lazy(() => import('@/pages/RevenueAnalysis'));
const AworkCostIndex = lazy(() => import('@/pages/AworkCostIndex'));
const EscalationAlerts = lazy(() => import('@/pages/EscalationAlerts'));
const WeeklyCashflow = lazy(() => import('@/pages/WeeklyCashflow'));
const CustomerRisk = lazy(() => import('@/pages/CustomerRisk'));
const VarianceAnalysis = lazy(() => import('@/pages/VarianceAnalysis'));
const MasterDataImport = lazy(() => import('@/pages/MasterDataImport'));
const BillingDataReset = lazy(() => import('@/pages/BillingDataReset'));
const OperationalReset = lazy(() => import('@/pages/OperationalReset'));
const SevdeskReimport = lazy(() => import('@/pages/SevdeskReimport'));
const Hosting = lazy(() => import('@/pages/Hosting'));
const CrmBoard = lazy(() => import('@/pages/CrmBoard'));
const CrmInbox = lazy(() => import('@/pages/CrmInbox'));
const CrmDealDetail = lazy(() => import('@/pages/CrmDealDetail'));
const CrmQuotes = lazy(() => import('@/pages/CrmQuotes'));
const CrmProposals = lazy(() => import('@/pages/CrmProposals'));
const CrmEmails = lazy(() => import('@/pages/CrmEmails'));
const CrmEscalations = lazy(() => import('@/pages/CrmEscalations'));
const CrmProposalDetail = lazy(() => import('@/pages/CrmProposalDetail'));
const CrmQuoteDetail = lazy(() => import('@/pages/CrmQuoteDetail'));
const AuditTrail = lazy(() => import('@/pages/AuditTrail'));
import RestructuringLayout from '@/components/restructuring/RestructuringLayout';
const RestructuringCockpit = lazy(() => import('@/pages/RestructuringCockpit'));
const Restructuring13Week = lazy(() => import('@/pages/Restructuring13Week'));
const RestructuringPlan = lazy(() => import('@/pages/RestructuringPlan'));
const RestructuringSollIst = lazy(() => import('@/pages/RestructuringSollIst'));
const RestructuringFortfuehrung = lazy(() => import('@/pages/RestructuringFortfuehrung'));
const RestructuringForecast = lazy(() => import('@/pages/RestructuringForecast'));
const RestructuringAging = lazy(() => import('@/pages/RestructuringAging'));
const RestructuringBacklog = lazy(() => import('@/pages/RestructuringBacklog'));
const RestructuringWip = lazy(() => import('@/pages/RestructuringWip'));
const RestructuringCoverage = lazy(() => import('@/pages/RestructuringCoverage'));
const RestructuringSetup = lazy(() => import('@/pages/RestructuringSetup'));
const SprintHeute = lazy(() => import('@/pages/sprint/SprintHeute'));
const Uebernahme = lazy(() => import('@/pages/sprint/Uebernahme'));
const Auslastungsforecast = lazy(() => import('@/pages/sprint/Auslastungsforecast'));
const Arbeitszeitauswertung = lazy(() => import('@/pages/sprint/Arbeitszeitauswertung'));
const Rueckmeldungen = lazy(() => import('@/pages/Rueckmeldungen'));
const SprintUebersicht = lazy(() => import('@/pages/sprint/SprintUebersicht'));
const SprintProjekte = lazy(() => import('@/pages/sprint/SprintProjekte'));
const SprintIntelligence = lazy(() => import('@/pages/sprint/SprintIntelligence'));
const Zeiten = lazy(() => import('@/pages/Zeiten'));
const SprintModulKatalog = lazy(() => import('@/pages/sprint/SprintModulKatalog'));
const SprintAssistent = lazy(() => import('@/pages/sprint/SprintAssistent'));
const SprintModuleHinzufuegen = lazy(() => import('@/pages/sprint/SprintModuleHinzufuegen'));
const SprintDetail = lazy(() => import('@/pages/sprint/SprintDetail'));
const SprintMilestoneDetail = lazy(() => import('@/pages/sprint/SprintMilestoneDetail'));
const SprintPlanung = lazy(() => import('@/pages/sprint/SprintPlanung'));
const SprintSteuerung = lazy(() => import('@/pages/sprint/SprintSteuerung'));
const SprintRechnungsuebergabe = lazy(() => import('@/pages/sprint/SprintRechnungsuebergabe'));
import MasseverwalterReport from '@/pages/MasseverwalterReport';
const SystemMaintenance = lazy(() => import('@/pages/SystemMaintenance'));

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
      // Nie von selbst weiterleiten: das war die Ursache der Endlosschleife
      // (Laden → Weiterleitung → weißer Bildschirm). Die Person entscheidet.
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
          <div className="text-center max-w-sm">
            <p className="font-semibold">Anmeldung erforderlich</p>
            <p className="mt-2 text-sm text-muted-foreground">Bitte einmal anmelden, dann geht es weiter.</p>
            <button onClick={navigateToLogin} className="mt-4 px-4 py-2 rounded bg-primary text-primary-foreground text-sm">Zur Anmeldung</button>
          </div>
        </div>
      );
    }
    // Jeder andere Fehler wird benannt, statt einen leeren Bildschirm zu hinterlassen.
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background p-6">
        <div className="text-center max-w-sm">
          <p className="font-semibold">Die App konnte nicht geladen werden</p>
          <p className="mt-2 text-sm text-muted-foreground">{authError.message || 'Unbekannter Fehler'}</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 rounded bg-primary text-primary-foreground text-sm">Neu laden</button>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Ansicht wird geladen...</div>}>
    <Routes>
      <Route element={<AppLayout />}>
        {/* Ausgangspunkt für alle ist der eigene Tag; die Entscheidungslisten liegen unter Freigaben. */}
        <Route path="/" element={<Navigate to="/sprint" replace />} />
        <Route path="/freigaben" element={<MyDay />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/confirmed-orders" element={<ConfirmedOrders />} />
        <Route path="/confirmed-orders/:orderId" element={<ConfirmedOrderDetail />} />
        <Route path="/invoice-matching" element={<AdminRoute><InvoiceMatchingReview /></AdminRoute>} />
        <Route path="/next-month-forecast" element={<NextMonthForecast />} />
        <Route path="/invoice-ready" element={<InvoiceReady />} />
        <Route path="/support-billing" element={<SupportBilling />} />
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
        <Route path="/system/maintenance" element={<AdminRoute><SystemMaintenance /></AdminRoute>} />
        <Route path="/sprint" element={<SprintHeute />} />
        <Route path="/sprint/uebernahme" element={<Uebernahme />} />
        <Route path="/sprint/uebersicht" element={<SprintUebersicht />} />
        <Route path="/sprint/auslastung" element={<AdminRoute><Auslastungsforecast /></AdminRoute>} />
        <Route path="/sprint/arbeitszeit" element={<AdminRoute><Arbeitszeitauswertung /></AdminRoute>} />
        <Route path="/rueckmeldungen" element={<AdminRoute><Rueckmeldungen /></AdminRoute>} />
        <Route path="/zeiten" element={<Zeiten />} />
        <Route path="/sprint/projekte" element={<SprintProjekte />} />
        <Route path="/sprint/intelligence" element={<SprintIntelligence />} />
        <Route path="/sprint/katalog" element={<SprintModulKatalog />} />
        <Route path="/sprint/neu" element={<SprintAssistent />} />
        <Route path="/sprint/sprints/:sprintId" element={<SprintDetail />} />
        <Route path="/sprint/sprints/:sprintId/module" element={<SprintModuleHinzufuegen />} />
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
    </Suspense>
  );
};

function App() {
  return (
    /* Fehlergrenze ganz außen — auch ein Fehler in Anmeldung, Datenschicht
       oder Navigation hinterlässt so keine weiße Seite. */
    <FehlerGrenze>
      <AuthProvider>
        <QueryClientProvider client={queryClientInstance}>
          {/* Seitenwechsel als React-Übergang: die bisherige Seite bleibt sichtbar,
              bis der Code der neuen Seite geladen ist (kein „Ansicht wird geladen“). */}
          <Router future={{ v7_startTransition: true }}>
            <FehlerGrenze>
              <AuthenticatedApp />
            </FehlerGrenze>
          </Router>
          <Toaster />
        </QueryClientProvider>
      </AuthProvider>
    </FehlerGrenze>
  )
}

export default App