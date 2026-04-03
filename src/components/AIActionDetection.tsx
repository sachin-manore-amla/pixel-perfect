import { aiInsights } from "@/data/aiMockData";
import { Target, CircleDot, CheckCircle2, AlertCircle } from "lucide-react";

export function AIActionDetection() {
  const allActions = aiInsights.flatMap((insight) =>
    insight.actions.map((a) => ({ ...a, ticketKey: insight.ticketKey, sentiment: insight.sentiment }))
  );
  const pending = allActions.filter((a) => a.status === "pending");
  const done = allActions.filter((a) => a.status === "done");

  return (
    <div className="rounded bg-card border border-border p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-ai" />
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">AI Action Detection</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded bg-warning/10 text-warning font-medium">
          {pending.length} pending
        </span>
      </div>

      <div className="space-y-2">
        {pending.slice(0, 8).map((action, i) => (
          <div key={i} className="flex items-start gap-3 p-2.5 border border-border rounded hover:bg-muted/30 transition-colors">
            <CircleDot className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
              action.sentiment === "critical" ? "text-critical" :
              action.sentiment === "urgent" ? "text-warning" : "text-info"
            }`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-mono text-xs text-primary">{action.ticketKey}</span>
                <span className="text-xs text-muted-foreground">→</span>
                <span className="text-xs font-medium text-foreground">{action.owner}</span>
              </div>
              <p className="text-xs text-muted-foreground">{action.action}</p>
            </div>
            <AlertCircle className="h-3 w-3 text-warning shrink-0 mt-1" />
          </div>
        ))}

        {done.length > 0 && (
          <div className="pt-2 border-t border-border mt-3">
            <p className="text-xs text-muted-foreground mb-2">Completed</p>
            {done.map((action, i) => (
              <div key={i} className="flex items-center gap-3 p-2 opacity-60">
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                <span className="font-mono text-xs">{action.ticketKey}</span>
                <span className="text-xs text-muted-foreground truncate">{action.owner}: {action.action}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
