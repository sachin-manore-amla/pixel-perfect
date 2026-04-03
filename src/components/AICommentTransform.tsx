import { aiInsights } from "@/data/aiMockData";
import { MessageSquare, ArrowRight, Sparkles } from "lucide-react";
import { useState } from "react";

export function AICommentTransform() {
  const withComments = aiInsights.filter((i) => i.originalInternalComment && i.customerFriendlyComment);
  const [selectedIdx, setSelectedIdx] = useState(0);

  if (withComments.length === 0) return null;

  const current = withComments[selectedIdx];

  return (
    <div className="rounded bg-card border border-border p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-ai" />
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Smart Comment Transform</span>
        <span className="ml-auto text-xs text-muted-foreground">Internal → Customer</span>
      </div>

      {/* Ticket selector */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {withComments.map((insight, idx) => (
          <button
            key={insight.ticketKey}
            onClick={() => setSelectedIdx(idx)}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              idx === selectedIdx
                ? "bg-ai/10 border-ai text-ai"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {insight.ticketKey}
          </button>
        ))}
      </div>

      {/* Transform view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Internal */}
        <div className="rounded border border-border p-3 bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" />
            Internal Comment
          </p>
          <p className="text-xs text-foreground leading-relaxed font-mono">{current.originalInternalComment}</p>
        </div>

        {/* Arrow */}
        <div className="hidden lg:flex items-center justify-center absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        </div>

        {/* Customer-friendly */}
        <div className="rounded border border-ai/30 p-3 bg-ai/5 relative">
          <p className="text-xs font-semibold text-ai uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            AI-Transformed (Customer-Friendly)
          </p>
          <p className="text-xs text-foreground leading-relaxed">{current.customerFriendlyComment}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
        <ArrowRight className="h-3 w-3" />
        <span>Technical jargon automatically converted to professional customer communication</span>
      </div>
    </div>
  );
}
