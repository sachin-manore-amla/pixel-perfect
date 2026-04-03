import { aiInsights } from "@/data/aiMockData";
import { FileText, ChevronRight } from "lucide-react";
import { useState } from "react";

export function AITicketSummaries() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const summaries = aiInsights.filter((i) => i.summary);

  return (
    <div className="rounded bg-card border border-border p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-4 w-4 text-ai" />
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">AI Ticket Summaries</span>
        <span className="ml-auto text-xs text-muted-foreground">Auto-generated</span>
      </div>

      <div className="space-y-2">
        {summaries.slice(0, 5).map((insight) => (
          <div
            key={insight.ticketKey}
            className="border border-border rounded cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setExpanded(expanded === insight.ticketKey ? null : insight.ticketKey)}
          >
            <div className="flex items-center gap-3 p-3">
              <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${expanded === insight.ticketKey ? "rotate-90" : ""}`} />
              <span className="font-mono text-xs text-primary shrink-0">{insight.ticketKey}</span>
              <p className="text-xs text-foreground truncate flex-1">{insight.summary.split(".")[0]}.</p>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                insight.sentiment === "critical" ? "bg-critical/10 text-critical" :
                insight.sentiment === "urgent" ? "bg-warning/10 text-warning" :
                "bg-primary/10 text-primary"
              }`}>
                {insight.priorityScore}/100
              </span>
            </div>

            {expanded === insight.ticketKey && (
              <div className="px-3 pb-3 pt-0 border-t border-border mt-0">
                <div className="bg-ai/5 border border-ai/20 rounded p-3 mt-3">
                  <p className="text-xs font-medium text-ai mb-1">🧠 AI Summary</p>
                  <p className="text-xs text-foreground leading-relaxed">{insight.summary}</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
