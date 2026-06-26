import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OnboardingGate } from "@/components/OnboardingGate";
import AttentionPage from "./pages/AttentionPage.tsx";
import AlertsPage from "./pages/AlertsPage.tsx";
import CommentSyncPage from "./pages/CommentSyncPage.tsx";
import SLAMonitorPage from "./pages/SLAMonitorPage.tsx";
import Settings from "./pages/Settings.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <OnboardingGate>
          <Routes>
            <Route path="/" element={<Navigate to="/attention" replace />} />
            <Route path="/attention" element={<AttentionPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/sync" element={<CommentSyncPage />} />
            <Route path="/sla" element={<SLAMonitorPage />} />
            <Route path="/settings" element={<Settings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </OnboardingGate>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
