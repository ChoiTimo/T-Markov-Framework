import { Routes, Route } from "react-router-dom";
import Layout from "@/components/layout/Layout";
import Dashboard from "@/pages/Dashboard";
import QuoteCalculator from "@/pages/QuoteCalculator";
import BattleCards from "@/pages/BattleCards";
import ProposalBuilder from "@/pages/ProposalBuilder";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="quotes" element={<QuoteCalculator />} />
        <Route path="battlecards" element={<BattleCards />} />
        <Route path="proposals" element={<ProposalBuilder />} />
      </Route>
    </Routes>
  );
}

export default App;
