import { DashboardLayout } from "@/components/DashboardLayout";
import { AIPriorityScoring } from "@/components/AIPriorityScoring";
import { AITicketSummaries } from "@/components/AITicketSummaries";
import { AIActionDetection } from "@/components/AIActionDetection";
import { AICommentTransform } from "@/components/AICommentTransform";
import { AIP1Tickets15Days } from "@/components/AIP1Tickets15Days";
import { Brain, Sparkles } from "lucide-react";

const AIInsightsPage = () => {
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Brain className="h-6 w-6 text-ai" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Intelligence Layer</h1>
            <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Smart prioritization • Summarization • Action detection • Comment transformation
            </p>
          </div>
          <span className="ml-auto text-xs px-2.5 py-1 rounded bg-ai/10 text-ai font-semibold border border-ai/20">MVP Phase 1</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <AIPriorityScoring />
          <AIActionDetection />
        </div>

        <AITicketSummaries />
        <AICommentTransform />
        <AIP1Tickets15Days />
      </div>
    </DashboardLayout>
  );
};

export default AIInsightsPage;
