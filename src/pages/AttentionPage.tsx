import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Eye, MessageCircle, Clock, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { useTicketsWithAnalysis } from "@/hooks/useTicketsWithAnalysis";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import { CommentsTimeline } from "@/components/CommentsTimeline";
import { NewActivityTable } from "@/components/NewActivityTable";
 
const AttentionPage = () => {
  const [daysWindow, setDaysWindow] = useState<1 | 15 | 30>(30);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const { data: analysisData, isLoading, error } = useTicketsWithAnalysis(daysWindow);
  const { data: recentActivityData, isLoading: recentActivityLoading } = useRecentActivity(1);
  const attentionRequired = analysisData?.attentionRequired || [];
  const attentionCount = analysisData?.attentionCount || 0;
  const recentActivity = recentActivityData || [];
 
  const getWindowLabel = () => {
    if (daysWindow === 1) return "Last 24 Hours";
    if (daysWindow === 15) return "Last 15 Days";
    return "Last 30 Days";
  };
 
  // Sample data for New Activity Since Your Last Comment
  const dummyNewActivity = [
    {
      ticketKey: "OPS-098",
      summary: "Database connection pool exhaustion",
      lastComment: { author: "Mike Torres", text: "Pool size increased, monitoring" },
      assignee: "Mike Torres",
      commentedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      ticketKey: "OPS-087",
      summary: "CDN cache invalidation not propagating",
      lastComment: { author: "Priya Sharma", text: "Fix deployed to staging, needs QA verification" },
      assignee: "Priya Sharma",
      commentedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
    {
      ticketKey: "OPS-082",
      summary: "Memory leak in notification service",
      lastComment: { author: "DevOps", text: "Heap dump analysis in progress" },
      assignee: "James Liu",
      commentedAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
    {
      ticketKey: "OPS-068",
      summary: "Rate limiter misconfigured for partner API",
      lastComment: { author: "Tom Wilson", text: "Rate limit adjusted, partner team to verify" },
      assignee: "Tom Wilson",
      commentedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    },
  ];
 
  if (error) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="bg-critical/10 border border-critical/20 text-critical p-4 rounded">
            Error loading attention data. Please try again later.
          </div>
        </div>
      </DashboardLayout>
    );
  }
  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Attention Tracker</h1>
            <p className="text-sm text-muted-foreground mt-1">P1 Dev In Progress tickets requiring your response or immediate attention</p>
          </div>
         
          {/* Time Window Filter */}
          <div className="flex gap-2">
            <button
              onClick={() => setDaysWindow(1)}
              className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                daysWindow === 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground hover:bg-muted"
              }`}
            >
              24 Hours
            </button>
            <button
              onClick={() => setDaysWindow(15)}
              className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                daysWindow === 15
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground hover:bg-muted"
              }`}
            >
              15 Days
            </button>
            <button
              onClick={() => setDaysWindow(30)}
              className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                daysWindow === 30
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground hover:bg-muted"
              }`}
            >
              30 Days
            </button>
          </div>
        </div>
 
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded bg-card border border-border border-l-4 border-l-info p-4 animate-slide-in">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Needs Response</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              <p className="text-2xl font-bold text-foreground">{attentionCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{getWindowLabel()}</p>
          </div>
 
          <div className="rounded bg-card border border-border border-l-4 border-l-critical p-4 animate-slide-in">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Unattended</span>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">0</p>
          </div>
 
          <div className="rounded bg-card border border-border border-l-4 border-l-primary p-4 animate-slide-in">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Watching</span>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">0</p>
          </div>
        </div>
 
        {/* Attention Required Section */}
        <div className="rounded bg-card border border-border border-l-4 border-l-info p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">P1 Dev In Progress - Tickets Needing Attention</h2>
              <p className="text-xs text-muted-foreground mt-1">{getWindowLabel()}</p>
            </div>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>
          {attentionRequired.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets requiring attention at this time.</p>
          ) : (
            <div className="space-y-3">
              {attentionRequired.map((ticket) => (
                <div key={ticket.ticketKey} className="border border-border rounded overflow-hidden bg-muted/30 hover:bg-muted/50 transition-colors">
                  <button
                    onClick={() =>
                      setExpandedTicket(
                        expandedTicket === ticket.ticketKey ? null : ticket.ticketKey
                      )
                    }
                    className="w-full p-4 flex items-center justify-between hover:bg-muted/30"
                  >
                    <div className="flex items-start gap-4 flex-1 text-left">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <a
                            href={`https://amla.atlassian.net/browse/${ticket.ticketKey}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm font-semibold text-primary hover:underline"
                          >
                            {ticket.ticketKey}
                          </a>
                          <span
                            className={`text-xs font-semibold px-2 py-1 rounded ${
                              ticket.priority === "HIGH"
                                ? "bg-critical/20 text-critical"
                                : ticket.priority === "MEDIUM"
                                  ? "bg-warning/20 text-warning"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {ticket.priority}
                          </span>
                        </div>
                        <p className="text-sm text-foreground mt-1">{ticket.ticketSummary}</p>
                        <p className="text-xs text-muted-foreground mt-2">{ticket.reason}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {ticket.commentCount} comment{ticket.commentCount !== 1 ? "s" : ""} • {ticket.status}
                        </p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-4">
                      {expandedTicket === ticket.ticketKey ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </button>
 
                  {/* Comments Timeline - Expandable */}
                  {expandedTicket === ticket.ticketKey && (
                    <div className="border-t border-border px-4 py-4 bg-muted/20">
                      <div className="mb-3">
                        <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                          <MessageCircle className="h-4 w-4 text-primary" />
                          Comments ({ticket.commentCount})
                        </h4>
                      </div>
                      <CommentsTimeline comments={ticket.comments} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
 
        {/* New Activity Since Your Last Comment Section */}
        <div className="mt-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">New Activity Since Your Last Comment</h2>
            <p className="text-sm text-muted-foreground mt-1">Recent activity from team members</p>
          </div>
          <NewActivityTable items={dummyNewActivity} isLoading={false} />
        </div>
 
        {/* P1 Unattended Tickets Section */}
        <div className="mt-8">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">P1 Unattended Tickets (Only 1 Watcher)</h2>
            <p className="text-sm text-muted-foreground mt-1">Recent P1 tickets with new comments</p>
          </div>
          <NewActivityTable items={recentActivity} isLoading={recentActivityLoading} />
        </div>
      </div>
    </DashboardLayout>
  );
};
 
export default AttentionPage;