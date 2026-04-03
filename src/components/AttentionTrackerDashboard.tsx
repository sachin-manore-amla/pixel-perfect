import { useState } from "react";
import { useTicketsWithAnalysis } from "@/hooks/useTicketsWithAnalysis";
import { Loader2, AlertCircle, ChevronDown, ChevronUp } from "lucide-react";
import { CommentsTimeline } from "@/components/CommentsTimeline";

interface WindowData {
  label: string;
  days: 1 | 15 | 30;
  title: string;
}

const TIME_WINDOWS: WindowData[] = [
  { label: "Needs Response", days: 1, title: "Last 24h" },
  { label: "15 Days", days: 15, title: "Last 15d" },
  { label: "30 Days", days: 30, title: "Last 30d" },
];

function TimeWindowBlock({ window, expandedTicket, setExpandedTicket }: { 
  window: WindowData; 
  expandedTicket: Record<string, string | null>;
  setExpandedTicket: React.Dispatch<React.SetStateAction<Record<string, string | null>>>;
}) {
  const { data: analysisData, isLoading, error } = useTicketsWithAnalysis(window.days);
  const attentionRequired = analysisData?.attentionRequired || [];
  const attentionCount = analysisData?.attentionCount || 0;
  const key = `window-${window.days}`;

  if (error) {
    return (
      <div className="rounded bg-card border border-border border-l-4 border-l-critical p-4">
        <div className="flex items-center gap-2 mb-3">
          <AlertCircle className="h-4 w-4 text-critical flex-shrink-0" />
          <p className="text-sm font-semibold text-critical">Failed to load</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded bg-card border border-border border-l-4 border-l-info p-4 h-full flex flex-col">
      <div className="mb-4">
        <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">{window.label}</p>
        <div className="flex items-center gap-2 mt-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <p className="text-3xl font-bold text-foreground">{attentionCount}</p>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Tickets needing attention</p>
      </div>

      {attentionRequired.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {isLoading ? "Loading..." : "No issues at this time"}
        </p>
      ) : (
        <div className="space-y-2 flex-1 overflow-y-auto">
          {attentionRequired.slice(0, 5).map((ticket) => (
            <div
              key={ticket.ticketKey}
              className="p-2 rounded bg-muted/50 border border-border transition-colors"
            >
              <button
                onClick={() =>
                  setExpandedTicket(prev => ({
                    ...prev,
                    [`${key}-${ticket.ticketKey}`]: 
                      prev[`${key}-${ticket.ticketKey}`] === ticket.ticketKey ? null : ticket.ticketKey
                  }))
                }
                className="w-full flex items-start justify-between gap-2 text-left hover:bg-muted/30 -m-2 p-2 rounded"
              >
                <div className="flex-1 min-w-0">
                  <a
                    href={`https://amla.atlassian.net/browse/${ticket.ticketKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs font-semibold text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ticket.ticketKey}
                  </a>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{ticket.reason}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      ticket.priority === "HIGH"
                        ? "bg-destructive/10 text-destructive"
                        : ticket.priority === "MEDIUM"
                          ? "bg-warning/10 text-warning"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ticket.priority}
                  </span>
                  {expandedTicket[`${key}-${ticket.ticketKey}`] === ticket.ticketKey ? (
                    <ChevronUp className="h-3 w-3 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Latest Comments - Expandable */}
              {expandedTicket[`${key}-${ticket.ticketKey}`] === ticket.ticketKey && ticket.comments.length > 0 && (
                <div className="border-t border-border mt-2 pt-2 text-xs">
                  <p className="font-semibold text-foreground mb-1">Comments:</p>
                  <CommentsTimeline comments={ticket.comments} maxComments={3} compact={true} />
                </div>
              )}
            </div>
          ))}

          {attentionRequired.length > 5 && (
            <a
              href="/attention"
              className="text-xs font-semibold text-primary hover:underline inline-block mt-1"
            >
              View all {attentionRequired.length} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export function AttentionTrackerDashboard() {
  const [expandedTicket, setExpandedTicket] = useState<Record<string, string | null>>({});

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">Attention Tracker</h2>
        <p className="text-sm text-muted-foreground mt-1">P1 Dev In Progress - Tickets needing response</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {TIME_WINDOWS.map((window) => (
          <TimeWindowBlock 
            key={window.days}
            window={window}
            expandedTicket={expandedTicket}
            setExpandedTicket={setExpandedTicket}
          />
        ))}
      </div>
    </section>
  );
}
