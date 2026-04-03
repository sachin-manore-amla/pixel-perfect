import { useTicketsWithAnalysis } from "@/hooks/useTicketsWithAnalysis";
import { AlertCircle, Loader2, ChevronRight, Clock } from "lucide-react";

interface AttentionTicket {
  ticketKey: string;
  ticketSummary: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  updated: string;
  status: string;
}

export function AttentionRequiredSection() {
  const { data, isLoading, error } = useTicketsWithAnalysis();

  if (isLoading) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">
          🚨 Attention Required (Last 30 Days)
        </h2>
        <div className="flex items-center justify-center p-8 bg-card border border-border rounded">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-foreground">Analyzing tickets...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">
          🚨 Attention Required (Last 30 Days)
        </h2>
        <div className="rounded bg-card border border-border p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-critical flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-critical">Failed to analyze tickets</p>
            <p className="text-xs text-muted-foreground mt-1">
              {error instanceof Error ? error.message : "Unknown error occurred"}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const attentionRequired: AttentionTicket[] = data?.attentionRequired || [];
  const totalCount = attentionRequired.length;

  if (totalCount === 0) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">
          🚨 Attention Required (Last 30 Days)
        </h2>
        <div className="rounded bg-card border border-border p-4 flex items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <p className="text-sm text-foreground">All tickets are in good shape! 🎉</p>
        </div>
      </section>
    );
  }

  // Helper function to format time
  const formatUpdatedTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    if (diffHours === 0) {
      return `${diffMinutes}m ago`;
    } else if (diffHours === 1) {
      return "1h ago";
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">
          🚨 Attention Required (Last 30 Days)
        </h2>
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-destructive text-destructive-foreground rounded text-base font-semibold">
          {totalCount} Ticket{totalCount !== 1 ? "s" : ""}
        </div>
      </div>

      <div className="grid gap-3">
        {attentionRequired.map((ticket: AttentionTicket) => (
          <div
            key={ticket.ticketKey}
            className="rounded bg-card border-l-4 border-l-critical border border-border p-4 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <a
                    href={`https://amla.atlassian.net/browse/${ticket.ticketKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm font-semibold text-primary hover:underline"
                  >
                    {ticket.ticketKey}
                  </a>
                  <span
                    className={`text-xs font-medium px-2 py-1 rounded ${
                      ticket.priority === "HIGH"
                        ? "bg-destructive text-destructive-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {ticket.priority}
                  </span>
                </div>

                <p className="text-sm font-medium text-foreground mb-2 truncate">
                  {ticket.ticketSummary}
                </p>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">{ticket.reason}</p>

                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3">
                    <Clock className="h-3 w-3" />
                    <span>Updated {formatUpdatedTime(ticket.updated)}</span>
                  </div>
                </div>
              </div>

              <a
                href={`https://amla.atlassian.net/browse/${ticket.ticketKey}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-shrink-0 p-2 hover:bg-muted rounded transition-colors"
              >
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
