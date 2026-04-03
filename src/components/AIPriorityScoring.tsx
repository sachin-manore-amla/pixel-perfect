import { aiInsights } from "@/data/aiMockData";
import { Brain, TrendingUp, TrendingDown } from "lucide-react";

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-critical" : score >= 65 ? "bg-warning" : "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold font-mono ${score >= 85 ? "text-critical" : score >= 65 ? "text-warning" : "text-foreground"}`}>
        {score}
      </span>
    </div>
  );
}

export function AIPriorityScoring() {
  const sorted = [...aiInsights].sort((a, b) => b.priorityScore - a.priorityScore);

  return (
    <div className="rounded bg-card border border-border p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-4 w-4 text-ai" />
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">AI Priority Scoring</span>
        <span className="ml-auto text-xs text-muted-foreground">Dynamic • Beyond P1/P2</span>
      </div>

      <div className="space-y-3">
        {sorted.map((insight) => (
          <div key={insight.ticketKey} className="border border-border rounded p-3">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-primary cursor-pointer hover:underline">{insight.ticketKey}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                  insight.sentiment === "critical" ? "bg-critical/10 text-critical" :
                  insight.sentiment === "urgent" ? "bg-warning/10 text-warning" :
                  "bg-primary/10 text-primary"
                }`}>
                  {insight.sentiment}
                </span>
              </div>
              {insight.priorityScore >= 85 ? (
                <TrendingUp className="h-3.5 w-3.5 text-critical" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <ScoreBar score={insight.priorityScore} />
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{insight.priorityReason}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
