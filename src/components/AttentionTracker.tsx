import { mockTickets } from "@/data/mockData";
import { Eye, MessageCircle, Clock } from "lucide-react";

export function AttentionTracker() {
  const needsAttention = mockTickets.filter(
    (t) => t.hasNewActivity && t.lastManagerComment
  );
  const unattended = mockTickets.filter((t) => t.isUnattended);

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">Attention Required</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* New activity */}
        <div className="rounded bg-card border border-border border-l-4 border-l-info p-5 animate-slide-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">New Activity</span>
            <span className="text-xs text-primary cursor-pointer hover:underline">View All ({needsAttention.length})</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Last Comment</th>
              </tr>
            </thead>
            <tbody>
              {needsAttention.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="py-2">
                    <span className="font-mono text-primary cursor-pointer hover:underline">{t.key}</span>
                    <p className="text-muted-foreground truncate mt-0.5 max-w-[200px]">{t.summary}</p>
                  </td>
                  <td className="py-2 text-muted-foreground">
                    {t.lastComment && (
                      <p className="truncate max-w-[200px]">
                        <span className="text-foreground">{t.lastComment.author}:</span> {t.lastComment.text}
                      </p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Unattended */}
        <div className="rounded bg-card border border-border border-l-4 border-l-critical p-5 animate-slide-in">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Unattended</span>
            <span className="text-xs text-primary cursor-pointer hover:underline">View All ({unattended.length})</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                <th className="text-right py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Age</th>
              </tr>
            </thead>
            <tbody>
              {unattended.map((t) => {
                const hoursOld = Math.round((Date.now() - t.createdAt.getTime()) / 3600000);
                return (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="py-2">
                      <span className="font-mono text-primary cursor-pointer hover:underline">{t.key}</span>
                      <p className="text-muted-foreground truncate mt-0.5 max-w-[180px]">{t.summary}</p>
                    </td>
                    <td className="py-2 text-foreground">
                      {t.assignee === "Unassigned" ? <span className="text-critical">Unassigned</span> : t.assignee}
                    </td>
                    <td className="py-2 text-right font-mono text-critical">
                      {hoursOld < 24 ? `${hoursOld}h` : `${Math.round(hoursOld / 24)}d`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
