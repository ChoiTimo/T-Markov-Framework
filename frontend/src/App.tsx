import { Routes, Route } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import QuoteCalculator from "@/pages/QuoteCalculator";
import BattleCards from "@/pages/BattleCards";
import ProposalBuilder from "@/pages/ProposalBuilder";
import Members from "@/pages/Members";
import OrgSettings from "@/pages/OrgSettings";
import CreateOrg from "@/pages/CreateOrg";
import Profile from "@/pages/Profile";
import AuditLogs from "@/pages/AuditLogs";
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
        <Route path="battlecards" element={<BattleCards />} />
        <Route path="proposals" element={<ProposalBuilder />} />
        {/* Admin */}
        <Route path="members" element={<Members />} />
        <Route path="org/settings" element={<OrgSettings />} />
        <Route path="org/new" element={<CreateOrg />} />
        <Route path="profile" element={<Profile />} />
        <Route path="audit-logs" element={<AuditLogs />} />
      </Route>
    </Routes>
  );
}

export default App;
