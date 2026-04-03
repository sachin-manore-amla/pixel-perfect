import { DashboardLayout } from "@/components/DashboardLayout";
import { mockTickets } from "@/data/mockData";
import { Eye, MessageCircle, Clock, User } from "lucide-react";

const AttentionPage = () => {
  const needsAttention = mockTickets.filter((t) => t.hasNewActivity && t.lastManagerComment);
  const unattended = mockTickets.filter((t) => t.isUnattended);
  const allWatched = mockTickets.filter((t) => t.watchers.includes("Manager"));

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Attention Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">Tickets requiring your response or immediate attention</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Needs Response", value: needsAttention.length, icon: MessageCircle, color: "border-l-info" },
            { label: "Unattended", value: unattended.length, icon: Clock, color: "border-l-critical" },
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
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-3">Unattended Tickets</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                <th className="text-left py-2 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                <th className="text-right py-2 font-semibold text-muted-foreground uppercase tracking-wider">Age</th>
              </tr>
            </thead>
            <tbody>
              {unattended.map((t) => {
                const hoursOld = Math.round((Date.now() - t.createdAt.getTime()) / 3600000);
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AttentionPage;
