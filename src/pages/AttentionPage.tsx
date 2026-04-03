import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { mockTickets } from "@/data/mockData";
import { Eye, MessageCircle, Clock, User, Loader2, ExternalLink } from "lucide-react";
import { useP1Tickets } from "@/hooks/use-p1-tickets";
import { Badge } from "@/components/ui/badge";


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
  const needsAttention = mockTickets.filter((t) => t.hasNewActivity && t.lastManagerComment);
  const mockUnattended = mockTickets.filter((t) => t.isUnattended);
  const allWatched = mockTickets.filter((t) => t.watchers.includes("Manager"));

  const { unattendedTickets, loading, error } = useP1Tickets();

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
            { label: "P1 Unattended", value: unattendedTickets.length, icon: Clock, color: "border-l-critical" },
            { label: "Watching", value: allWatched.length, icon: Eye, color: "border-l-primary" },
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
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">
            P1 Unattended Tickets (Only 1 Watcher)
          </h2>
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}
          {error && (
            <div className="bg-destructive/10 border border-destructive/50 rounded p-3 text-sm text-destructive">
              Failed to load tickets: {error}
            </div>
          )}
          {!loading && !error && unattendedTickets.length === 0 && (
            <p className="text-sm text-muted-foreground py-4">No unattended P1 tickets found.</p>
          )}
          {!loading && unattendedTickets.length > 0 && (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                  <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                  <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                  <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Watchers</th>
                  <th className="text-right py-2 font-semibold text-muted-foreground uppercase tracking-wider">Updated</th>
                </tr>
              </thead>
              <tbody>
                {unattendedTickets.map((ticket) => {
                  const updatedDate = new Date(ticket.fields.updated);
                  const hoursOld = Math.round((Date.now() - updatedDate.getTime()) / 3600000);
                  const ageDisplay = hoursOld < 24 ? `${hoursOld}h ago` : `${Math.round(hoursOld / 24)}d ago`;

                  return (
                    <tr key={ticket.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 font-mono text-primary">
                        <a
                          href={`https://amla.atlassian.net/browse/${ticket.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline flex items-center gap-1"
                        >
                          {ticket.key}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="py-3 text-foreground truncate max-w-[300px]" title={ticket.fields.summary}>
                        {ticket.fields.summary}
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="text-xs">
                          {ticket.fields.status.name}
                        </Badge>
                      </td>
                      <td className="py-3 text-foreground">
                        {ticket.fields.assignee?.displayName || <span className="text-critical font-medium">Unassigned</span>}
                      </td>
                      <td className="py-3 text-center">
                        <Badge variant="secondary" className="text-xs">
                          {ticket.watchersCount} watcher{ticket.watchersCount !== 1 ? "s" : ""}
                        </Badge>
                      </td>
                      <td className="py-3 text-right text-muted-foreground text-xs">{ageDisplay}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AttentionPage;
