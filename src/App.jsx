import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/Dashboard';
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

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

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
        <Route path="/" element={<Dashboard />} />
        <Route path="/projects" element={<Projects />} />
        <Route path="/projects/:projectId" element={<ProjectDetail />} />
        <Route path="/confirmed-orders" element={<ConfirmedOrders />} />
        <Route path="/confirmed-orders/:orderId" element={<ConfirmedOrderDetail />} />
        <Route path="/invoice-matching" element={<InvoiceMatchingReview />} />
        <Route path="/next-month-forecast" element={<NextMonthForecast />} />
        <Route path="/invoice-ready" element={<InvoiceReady />} />
        <Route path="/online-marketing" element={<OnlineMarketing />} />
        <Route path="/maintenance" element={<Maintenance />} />
        <Route path="/production" element={<Production />} />
        <Route path="/tools" element={<Tools />} />
        <Route path="/receivables" element={<Receivables />} />
        <Route path="/payables" element={<Payables />} />
        <Route path="/forecast" element={<Forecast />} />
        <Route path="/seftest" element={<SefTest />} />
        <Route path="/import" element={<ImportCenter />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/awork-settings" element={<AworkSettings />} />
        <Route path="/awork-mapping" element={<AworkMappingReview />} />
        <Route path="/payment-consistency" element={<PaymentConsistencyCheck />} />
        <Route path="/sevdesk-settings" element={<SevdeskSettings />} />
        <Route path="/cashflow-advisor" element={<CashflowAdvisor />} />
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