import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import TriagePage from "./pages/TriagePage.tsx";
import AttentionPage from "./pages/AttentionPage.tsx";
import AIInsightsPage from "./pages/AIInsightsPage.tsx";
import AlertsPage from "./pages/AlertsPage.tsx";
import CommentSyncPage from "./pages/CommentSyncPage.tsx";
import SLAMonitorPage from "./pages/SLAMonitorPage.tsx";
import Settings from "./pages/Settings.tsx";
import P1Triage from "./pages/P1Triage.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/triage" element={<P1Triage />} />
          <Route path="/attention" element={<AttentionPage />} />
          <Route path="/ai-insights" element={<AIInsightsPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/sync" element={<CommentSyncPage />} />
          <Route path="/sla" element={<SLAMonitorPage />} />
          <Route path="/settings" element={<Settings />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
