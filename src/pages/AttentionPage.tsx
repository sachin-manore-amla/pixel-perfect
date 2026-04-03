import { DashboardLayout } from "@/components/DashboardLayout";
import { mockTickets } from "@/data/mockData";
import { Eye, MessageCircle, Clock, User, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

interface TicketWithWatchStatus {
  id: string;
  key: string;
  summary: string;
  assignee: string;
  isUnattended: boolean;
  hasNewActivity: boolean;
  lastManagerComment?: boolean;
  lastComment?: {
    author: string;
    text: string;
  };
  createdAt: Date;
  watchers: string[];
  isWatching?: boolean;
}

const AttentionPage = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [watching, setWatching] = useState<Set<string>>(new Set());
  const [tickets, setTickets] = useState<TicketWithWatchStatus[]>(
    mockTickets.map((t) => ({ ...t, isWatching: false }))
  );

  useEffect(() => {
    const checkWatchingStatus = async () => {
      try {
        setLoading(true);
        const issueKeys = mockTickets.map((t) => t.key);

        const response = await fetch("http://localhost:3001/api/jira/check-watching", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueKeys }),
        });

        if (!response.ok) {
          throw new Error("Failed to check watching status");
        }

        const watchingStatus = await response.json();

        // Update tickets with watching status
        const updatedTickets = mockTickets.map((t) => ({
          ...t,
          isWatching: watchingStatus[t.key] || false,
        }));

        setTickets(updatedTickets);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Failed to load watching status";
        console.error("[LOAD WATCHING STATUS ERROR]", err);
        setError(errorMsg);
        
        // Fall back to showing all tickets as unwatched
        const updatedTickets = mockTickets.map((t) => ({
          ...t,
          isWatching: false,
        }));
        setTickets(updatedTickets);
      } finally {
        setLoading(false);
      }
    };

    checkWatchingStatus();
  }, []);

  const watchTicket = async (issueKey: string) => {
    try {
      setWatching((prev) => new Set(prev).add(issueKey));

      const response = await fetch("http://localhost:3001/api/jira/watch-ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueKey }),
      });

      if (!response.ok) {
        throw new Error("Failed to watch ticket");
      }

      // Update local state - move ticket to watched
      setTickets((prev) =>
        prev.map((t) =>
          t.key === issueKey ? { ...t, isWatching: true } : t
        )
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to watch ticket";
      setError(errorMsg);
      console.error("[WATCH ERROR]", err);
    } finally {
      setWatching((prev) => {
        const newSet = new Set(prev);
        newSet.delete(issueKey);
        return newSet;
      });
    }
  };

  const needsAttention = tickets.filter((t) => t.hasNewActivity && t.lastManagerComment);
  const unattended = tickets.filter((t) => !t.isWatching);
  const attended = tickets.filter((t) => t.isWatching);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attention Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">Tickets requiring your response or immediate attention</p>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2 text-sm text-muted-foreground">Loading watching status...</span>
          </div>
        )}

        {error && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
            <p className="font-semibold">⚠️ Warning</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Needs Response", value: needsAttention.length, icon: MessageCircle, color: "border-l-info" },
            { label: "Unattended", value: unattended.length, icon: Clock, color: "border-l-critical" },
            { label: "Attending", value: attended.length, icon: Eye, color: "border-l-primary" },
          ].map((s) => (
            <div key={s.label} className={`rounded bg-card border border-border border-l-4 ${s.color} p-4`}>
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Needs Response */}
        <div className="rounded bg-card border border-border border-l-4 border-l-info p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">New Activity Since Your Last Comment</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Last Comment</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
              </tr>
            </thead>
            <tbody>
              {needsAttention.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-3 font-mono text-primary cursor-pointer hover:underline">{t.key}</td>
                  <td className="py-3 text-foreground truncate max-w-[250px]">{t.summary}</td>
                  <td className="py-3 text-muted-foreground">
                    {t.lastComment && (
                      <p className="truncate max-w-[250px]">
                        <span className="text-foreground">{t.lastComment.author}:</span> {t.lastComment.text}
                      </p>
                    )}
                  </td>
                  <td className="py-3 text-foreground">{t.assignee}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unattended */}
        <div className="rounded bg-card border border-border border-l-4 border-l-critical p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Unattended Tickets</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                <th className="text-right py-2 font-semibold text-muted-foreground uppercase tracking-wider">Age</th>
                <th className="text-right py-2 font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody>
              {unattended.map((t) => {
                const hoursOld = Math.round((Date.now() - t.createdAt.getTime()) / 3600000);
                const isWatching = watching.has(t.key);
                return (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-mono text-primary cursor-pointer hover:underline">{t.key}</td>
                    <td className="py-3 text-foreground truncate max-w-[250px]">{t.summary}</td>
                    <td className="py-3">
                      {t.assignee === "Unassigned"
                        ? <span className="text-critical font-medium">Unassigned</span>
                        : <span className="text-foreground">{t.assignee}</span>}
                    </td>
                    <td className="py-3 text-right font-mono text-critical">
                      {hoursOld < 24 ? `${hoursOld}h` : `${Math.round(hoursOld / 24)}d`}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => watchTicket(t.key)}
                        disabled={isWatching}
                        className={`text-xs px-2 py-1 rounded transition-colors ${
                          isWatching
                            ? "bg-muted text-muted-foreground cursor-wait"
                            : "bg-primary text-primary-foreground hover:opacity-90"
                        }`}
                      >
                        {isWatching ? "Watching..." : "Watch"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {unattended.length === 0 && (
            <div className="py-8 text-center text-muted-foreground">
              <p className="text-sm">No unattended tickets at the moment!</p>
            </div>
          )}
        </div>

        {/* Attended */}
        <div className="rounded bg-card border border-border border-l-4 border-l-primary p-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Tickets You Are Attending</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                <th className="text-right py-2 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {attended.length > 0 ? (
                attended.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-mono text-primary cursor-pointer hover:underline">{t.key}</td>
                    <td className="py-3 text-foreground truncate max-w-[250px]">{t.summary}</td>
                    <td className="py-3 text-foreground">{t.assignee}</td>
                    <td className="py-3 text-right">
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Eye className="h-3 w-3" />
                        Watching
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-muted-foreground">
                    No tickets you are currently attending
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AttentionPage;
