import { mockTickets } from "@/data/mockData";
import { Eye, MessageCircle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function AttentionTracker() {
  const needsAttention = mockTickets.filter(
    (t) => t.hasNewActivity && t.lastManagerComment
  );
  const unattended = mockTickets.filter((t) => t.isUnattended);

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Eye className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Attention Required</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* New activity after your response */}
        <div className="rounded-xl border border-border bg-card p-5 animate-slide-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-info" />
              <span className="text-sm font-medium text-foreground">New Activity</span>
            </div>
            <Badge variant="outline" className="border-info/30 text-info text-xs font-mono">
              {needsAttention.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {needsAttention.map((t) => (
              <div key={t.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                <span className="h-1.5 w-1.5 rounded-full bg-info mt-2 shrink-0 pulse-dot" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{t.key}</span>
                    <span className="text-xs text-foreground truncate">{t.summary}</span>
                  </div>
                  {t.lastComment && (
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      <span className="text-foreground/70">{t.lastComment.author}:</span> {t.lastComment.text}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Unattended tickets */}
        <div className="rounded-xl border border-border bg-card p-5 animate-slide-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-critical" />
              <span className="text-sm font-medium text-foreground">Unattended</span>
            </div>
            <Badge variant="outline" className="border-critical/30 text-critical text-xs font-mono">
              {unattended.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {unattended.map((t) => {
              const hoursOld = Math.round(
                (Date.now() - t.createdAt.getTime()) / 3600000
              );
              return (
                <div key={t.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                  <span className="h-1.5 w-1.5 rounded-full bg-critical mt-2 shrink-0 pulse-dot" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono text-muted-foreground">{t.key}</span>
                        <span className="text-xs text-foreground truncate">{t.summary}</span>
                      </div>
                      <span className="text-xs font-mono text-critical shrink-0">
                        {hoursOld < 24 ? `${hoursOld}h` : `${Math.round(hoursOld / 24)}d`}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t.assignee === "Unassigned" ? "⚠ Unassigned" : `Assigned: ${t.assignee}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
