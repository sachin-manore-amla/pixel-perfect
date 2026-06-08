import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Eye, MessageCircle, Clock, Loader2, ChevronDown, ChevronUp, AlertTriangle, User, ChevronLeft, ChevronRight, FolderOpen, RotateCcw } from "lucide-react";
import { useTicketsWithAnalysis } from "@/hooks/useTicketsWithAnalysis";
import { useRecentActivity } from "@/hooks/useRecentActivity";
import { useUnattendedTickets } from "@/hooks/useUnattendedTickets";
import { useJiraConfig } from "@/hooks/use-jira-config";
import { useCurrentJiraUser } from "@/hooks/useCurrentJiraUser";
import { useSelectedProjects } from "@/hooks/useSelectedProjects";
import { CommentsTimeline } from "@/components/CommentsTimeline";
import { NewActivityTable } from "@/components/NewActivityTable";
import { getJiraIssueUrl } from "@/lib/jira";
 
const P1_DISMISSED_KEY = "p1_attention_dismissed";
const UNATTENDED_DISMISSED_KEY = "p1_unattended_dismissed";

function getDismissed(key: string): Record<string, number> {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}
function markDismissed(key: string, ticketKey: string) {
  try {
    const d = getDismissed(key);
    d[ticketKey] = Date.now();
    localStorage.setItem(key, JSON.stringify(d));
  } catch {}
}
function clearDismissed(key: string) {
  localStorage.removeItem(key);
}

const AttentionPage = () => {
  const [daysWindow, setDaysWindow] = useState<1 | 15 | 30>(1);
  const [expandedTicket, setExpandedTicket] = useState<string | null>(null);
  const [p1Page, setP1Page] = useState(1);
  const P1_PAGE_SIZE = 5;
  const [unattendedPage, setUnattendedPage] = useState(1);
  const UNATTENDED_PAGE_SIZE = 10;
  const [visibleNewActivityCount, setVisibleNewActivityCount] = useState(0);
  const [p1Dismissed, setP1Dismissed] = useState<Record<string, number>>({});
  const [unattendedDismissed, setUnattendedDismissed] = useState<Record<string, number>>({});

  useEffect(() => {
    setP1Dismissed(getDismissed(P1_DISMISSED_KEY));
    setUnattendedDismissed(getDismissed(UNATTENDED_DISMISSED_KEY));
  }, []);
  const { config: jiraConfig } = useJiraConfig();
  const { data: currentJiraUser } = useCurrentJiraUser();
  const currentUserDisplayName = currentJiraUser?.displayName;
  const { selectedProjects, isConfigured } = useSelectedProjects();
  const { data: analysisData, isLoading, error } = useTicketsWithAnalysis(daysWindow, selectedProjects, currentJiraUser ?? undefined);
  const { data: recentActivityData, isLoading: recentActivityLoading } = useRecentActivity(1, currentUserDisplayName, selectedProjects);
  const { data: unattendedData, isLoading: unattendedLoading } = useUnattendedTickets(daysWindow * 24, selectedProjects, currentJiraUser ?? undefined);
  const attentionRequired = (analysisData?.attentionRequired || []).filter(t => !p1Dismissed[t.ticketKey]);
  const attentionCount = attentionRequired.length;
  const p1TotalPages = Math.ceil(attentionRequired.length / P1_PAGE_SIZE);
  const p1PagedTickets = attentionRequired.slice((p1Page - 1) * P1_PAGE_SIZE, p1Page * P1_PAGE_SIZE);
  const recentActivity = recentActivityData || [];
  const unattendedTickets = (unattendedData || []).filter(t => !unattendedDismissed[t.ticketKey]);
  const unattendedTotalPages = Math.ceil(unattendedTickets.length / UNATTENDED_PAGE_SIZE);
  const unattendedPagedTickets = unattendedTickets.slice((unattendedPage - 1) * UNATTENDED_PAGE_SIZE, unattendedPage * UNATTENDED_PAGE_SIZE);
 
  const getWindowLabel = () => {
    if (daysWindow === 1) return "Last 24 Hours";
    if (daysWindow === 15) return "Last 15 Days";
    return "Last 30 Days";
  };
 
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
        {/* No projects selected — empty state */}
        {!isConfigured && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <FolderOpen className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">No Projects Selected</h2>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm">
              Click your <strong>profile icon</strong> in the top-right corner and select <strong>Edit Selected Projects</strong> to get started.
            </p>
          </div>
        )}

        {isConfigured && (<>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Attention Tracker</h1>
            <p className="text-sm text-muted-foreground mt-1">Monitor P1 tickets that need your immediate action</p>
          </div>

          <div className="flex items-center gap-3">
            {/* Time Window Filter */}
            <div className="flex gap-2">
            <button
              onClick={() => { setDaysWindow(1); setP1Page(1); setUnattendedPage(1); }}
              className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                daysWindow === 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground hover:bg-muted"
              }`}
            >
              24 Hours
            </button>
            <button
              onClick={() => { setDaysWindow(15); setP1Page(1); setUnattendedPage(1); }}
              className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                daysWindow === 15
                  ? "bg-primary text-primary-foreground"
                  : "bg-card border border-border text-foreground hover:bg-muted"
              }`}
            >
              15 Days
            </button>
            <button
              onClick={() => { setDaysWindow(30); setP1Page(1); setUnattendedPage(1); }}
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
        </div>
 
        {/* Section Guide */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex gap-3 p-3 rounded-lg bg-info/5 border border-info/20">
            <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-info/15 flex items-center justify-center text-info font-bold text-sm">1</div>
            <div>
              <p className="text-xs font-semibold text-foreground">P1 Tickets Needing Attention</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                A ticket appears here only when <span className="text-foreground font-medium">both</span> conditions are met —
                {" "}(1) you were <span className="text-info font-medium">@mentioned in the last 2–3 comments</span>,
                {" "}and (2) AI or keyword analysis detects an <span className="text-info font-medium">unanswered question, blocker, or escalation</span> in the thread.
              </p>
            </div>
          </div>
          <div className="flex gap-3 p-3 rounded-lg bg-warning/5 border border-warning/20">
            <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-warning/15 flex items-center justify-center text-warning font-bold text-sm">2</div>
            <div>
              <p className="text-xs font-semibold text-foreground">New Activity Since Your Last Comment</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tickets where <span className="text-foreground font-medium">1–3 new comments</span> have arrived after your last reply — you may need to follow up.
                {" "}A ticket <span className="text-warning font-medium">automatically drops off</span> this list once 4 or more comments pile up without your response.
              </p>
            </div>
          </div>
          <div className="flex gap-3 p-3 rounded-lg bg-critical/5 border border-critical/20">
            <div className="mt-0.5 flex-shrink-0 w-7 h-7 rounded-full bg-critical/15 flex items-center justify-center text-critical font-bold text-sm">3</div>
            <div>
              <p className="text-xs font-semibold text-foreground">P1 Unattended Tickets</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Active P1 tickets <span className="text-foreground font-medium">assigned to you or where you are @mentioned</span>, with
                {" "}<span className="text-critical font-medium">no comment or status change</span> within the selected time window.
              </p>
            </div>
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

          <div className="rounded bg-card border border-border border-l-4 border-l-warning p-4 animate-slide-in">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">New Activity</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {recentActivityLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              <p className="text-2xl font-bold text-foreground">{visibleNewActivityCount}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Since your last comment</p>
          </div>

          <div className="rounded bg-card border border-border border-l-4 border-l-critical p-4 animate-slide-in">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground uppercase tracking-wide">Unattended</span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {unattendedLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
              <p className="text-2xl font-bold text-foreground">{unattendedTickets.length}</p>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              No response in {daysWindow === 1 ? "24h+" : daysWindow === 15 ? "15 days" : "30 days"}
            </p>
          </div>
        </div>
 
        {/* Attention Required Section */}
        <div className="rounded bg-card border border-border border-l-4 border-l-info p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">P1 Tickets Needing Attention</h2>
              <p className="text-xs text-muted-foreground mt-1">{getWindowLabel()} • Click ticket key to open &amp; dismiss</p>
            </div>
            <div className="flex items-center gap-2">
              {Object.keys(p1Dismissed).length > 0 && (
                <button
                  onClick={() => { clearDismissed(P1_DISMISSED_KEY); setP1Dismissed({}); setP1Page(1); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1"
                >
                  <RotateCcw className="h-3 w-3" /> Reset ({Object.keys(p1Dismissed).length} hidden)
                </button>
              )}
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
            </div>
          </div>
          {attentionRequired.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tickets requiring attention at this time.</p>
          ) : (
            <div className="space-y-3">
              {p1PagedTickets.map((ticket) => (
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
                            href={getJiraIssueUrl(ticket.ticketKey)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-sm font-semibold text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              markDismissed(P1_DISMISSED_KEY, ticket.ticketKey);
                              setP1Dismissed(prev => ({ ...prev, [ticket.ticketKey]: Date.now() }));
                              setExpandedTicket(null);
                            }}
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
              {p1TotalPages > 1 && (
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Showing {(p1Page - 1) * P1_PAGE_SIZE + 1}–{Math.min(p1Page * P1_PAGE_SIZE, attentionRequired.length)} of {attentionRequired.length} tickets
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setP1Page((p) => Math.max(1, p - 1))}
                      disabled={p1Page === 1}
                      className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {Array.from({ length: p1TotalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setP1Page(page)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          page === p1Page
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => setP1Page((p) => Math.min(p1TotalPages, p + 1))}
                      disabled={p1Page === p1TotalPages}
                      className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
 
        {/* New Activity Since Your Last Comment Section */}
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">New Activity Since Your Last Comment</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {currentUserDisplayName
                  ? `Tickets where team replied after your last comment (${currentUserDisplayName})`
                  : "Connecting to Jira to identify your comments..."}
              </p>
            </div>
            {recentActivityLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          </div>
          {!recentActivityLoading && recentActivity.length === 0 ? (
            <div className="rounded bg-card border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No new activity in the last 24 hours.</p>
            </div>
          ) : (
            <NewActivityTable items={recentActivity} isLoading={recentActivityLoading} onVisibleCountChange={setVisibleNewActivityCount} />
          )}
        </div>
 
        {/* P1 Unattended Tickets Section */}
        <div className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">P1 Unattended Tickets</h2>
              <p className="text-sm text-muted-foreground mt-1">Active P1 tickets with no response in {getWindowLabel().toLowerCase()} • Click ticket key to open &amp; dismiss</p>
            </div>
            <div className="flex items-center gap-2">
              {Object.keys(unattendedDismissed).length > 0 && (
                <button
                  onClick={() => { clearDismissed(UNATTENDED_DISMISSED_KEY); setUnattendedDismissed({}); setUnattendedPage(1); }}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-2 py-1"
                >
                  <RotateCcw className="h-3 w-3" /> Reset ({Object.keys(unattendedDismissed).length} hidden)
                </button>
              )}
              {unattendedLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            </div>
          </div>

          {unattendedLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading unattended tickets...
            </div>
          ) : unattendedTickets.length === 0 ? (
            <div className="rounded bg-card border border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No unattended tickets — all P1s have recent activity 🎉</p>
            </div>
          ) : (
            <div className="rounded bg-card border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Last Activity</th>
                    <th className="text-right py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Silent For</th>
                  </tr>
                </thead>
                <tbody>
                  {unattendedPagedTickets.map((t) => (
                    <tr
                      key={t.ticketKey}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <a
                          href={getJiraIssueUrl(t.ticketKey)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-primary font-semibold hover:underline"
                          onClick={() => {
                            markDismissed(UNATTENDED_DISMISSED_KEY, t.ticketKey);
                            setUnattendedDismissed(prev => ({ ...prev, [t.ticketKey]: Date.now() }));
                          }}
                        >
                          {t.ticketKey}
                        </a>
                      </td>
                      <td className="py-3 px-4 text-foreground max-w-[250px]">
                        <div className="flex items-center gap-2">
                          <span className="truncate">{t.summary}</span>
                          {t.isMentioned && (
                            <span className="flex-shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded bg-warning/20 text-warning">@mentioned</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {t.assignee === "Unassigned" ? (
                          <span className="flex items-center gap-1 text-critical font-medium">
                            <User className="h-3 w-3" /> Unassigned
                          </span>
                        ) : (
                          <span className="text-foreground">{t.assignee}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{t.status}</td>
                      <td className="py-3 px-4">
                        {t.lastActivityType === "none" ? (
                          <span className="text-critical italic">No activity yet</span>
                        ) : t.lastActivityType === "status_change" ? (
                          <span className="flex items-center gap-1 text-warning">
                            <AlertTriangle className="h-3 w-3" /> Status changed
                          </span>
                        ) : t.reason === "no_comments" ? (
                          <span className="text-critical italic">No comments yet</span>
                        ) : (
                          <span className="text-muted-foreground">{t.lastCommentBy}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`font-mono font-bold ${
                          t.silentHours >= 72 ? "text-critical" :
                          t.silentHours >= 48 ? "text-warning" :
                          "text-muted-foreground"
                        }`}>
                          {t.silentHours >= 24
                            ? `${Math.floor(t.silentHours / 24)}d ${t.silentHours % 24}h`
                            : `${t.silentHours}h`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {unattendedTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20">
                  <span className="text-xs text-muted-foreground">
                    Showing {(unattendedPage - 1) * UNATTENDED_PAGE_SIZE + 1}–{Math.min(unattendedPage * UNATTENDED_PAGE_SIZE, unattendedTickets.length)} of {unattendedTickets.length} tickets
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setUnattendedPage((p) => Math.max(1, p - 1))}
                      disabled={unattendedPage === 1}
                      className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {Array.from({ length: unattendedTotalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setUnattendedPage(page)}
                        className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                          page === unattendedPage
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                    <button
                      onClick={() => setUnattendedPage((p) => Math.min(unattendedTotalPages, p + 1))}
                      disabled={unattendedPage === unattendedTotalPages}
                      className="p-1.5 rounded border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        </>)}
      </div>
    </DashboardLayout>
  );
};
 
export default AttentionPage;