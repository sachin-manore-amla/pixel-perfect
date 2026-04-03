import { DashboardLayout } from "@/components/DashboardLayout";
import { StatsBar } from "@/components/StatsBar";
import { P1BucketSection } from "@/components/P1BucketSection";
import { AttentionTrackerDashboard } from "@/components/AttentionTrackerDashboard";
import { AlertsPanel } from "@/components/AlertsPanel";
import { AIPriorityScoring } from "@/components/AIPriorityScoring";
import { AITicketSummaries } from "@/components/AITicketSummaries";
import { AIActionDetection } from "@/components/AIActionDetection";
import { AICommentTransform } from "@/components/AICommentTransform";
import { Brain } from "lucide-react";

const Index = () => {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Operations Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            P1 ticket triage • Attention tracking • Proactive alerts
          </p>
        </div>
        <StatsBar />
        <P1BucketSection />
        <AttentionTrackerDashboard />

        {/* AI Intelligence Layer */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-5 w-5 text-ai" />
            <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">AI Intelligence Layer</h2>
            <span className="text-xs px-2 py-0.5 rounded bg-ai/10 text-ai font-medium ml-1">MVP</span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AIPriorityScoring />
            <AIActionDetection />
          </div>

          <div className="mt-4">
            <AITicketSummaries />
          </div>

          <div className="mt-4">
            <AICommentTransform />
          </div>
        </section>

        <AlertsPanel />
      </div>
    </DashboardLayout>
  );
};

export default Index;
