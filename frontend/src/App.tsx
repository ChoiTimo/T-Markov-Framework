import { Routes, Route } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/pages/Dashboard";
import QuoteCalculator from "@/pages/QuoteCalculator";
import BattleCards from "@/pages/BattleCards";
import ProposalBuilder from "@/pages/ProposalBuilder";
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
      </Route>
    </Routes>
  );
}

export default App;
