import { Routes, Route } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import QuoteCalculator from "@/pages/QuoteCalculator";
import QuoteEditor from "@/pages/QuoteEditor";
import BattleCards from "@/pages/BattleCards";
import BattleCardDetail from "@/pages/BattleCardDetail";
import ProposalBuilder from "@/pages/ProposalBuilder";
import ProposalEditor from "@/pages/ProposalEditor";
import Members from "@/pages/Members";
import OrgSettings from "@/pages/OrgSettings";
import CreateOrg from "@/pages/CreateOrg";
import Profile from "@/pages/Profile";
import AuditLogs from "@/pages/AuditLogs";
import AiRecommendationReport from "@/pages/AiRecommendationReport";
import CompetitiveFeed from "@/pages/CompetitiveFeed";
import InsightsDashboard from "@/pages/InsightsDashboard";
import Customers from "@/pages/Customers";
import CustomerDetail from "@/pages/CustomerDetail";
import DealPipeline from "@/pages/DealPipeline";
import ModuleCatalog from "@/pages/ModuleCatalog";
import ModuleDetail from "@/pages/ModuleDetail";
import ReportsIndex from "@/pages/ReportsIndex";
import AISettings from "@/pages/AISettings";
import NotificationsSettings from "@/pages/NotificationsSettings";
import Login from "@/pages/Login";

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="quotes" element={<QuoteCalculator />} />
        <Route path="quotes/new" element={<QuoteEditor />} />
        <Route path="quotes/:id" element={<QuoteEditor />} />
        <Route path="battlecards" element={<BattleCards />} />
        <Route path="battlecards/:id" element={<BattleCardDetail />} />
        <Route path="proposals" element={<ProposalBuilder />} />
        <Route path="proposals/:id" element={<ProposalEditor />} />
        {/* Admin */}
        <Route path="members" element={<Members />} />
        <Route path="org/settings" element={<OrgSettings />} />
        <Route path="org/new" element={<CreateOrg />} />
        <Route path="profile" element={<Profile />} />
        <Route path="audit-logs" element={<AuditLogs />} />
        <Route path="reports/ai-recommendations" element={<AiRecommendationReport />} />
        <Route path="reports/competitive" element={<CompetitiveFeed />} />
        <Route path="insights" element={<InsightsDashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="deals" element={<DealPipeline />} />
        <Route path="modules" element={<ModuleCatalog />} />
        <Route path="modules/:code" element={<ModuleDetail />} />
        <Route path="reports" element={<ReportsIndex />} />
        <Route path="settings/ai" element={<AISettings />} />
        <Route path="settings/notifications" element={<NotificationsSettings />} />
      </Route>
    </Routes>
  );
}

export default App;
