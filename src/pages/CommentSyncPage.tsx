import { DashboardLayout } from "@/components/DashboardLayout";
import { mockTickets } from "@/data/mockData";
import { MessageSquare, Check, X, ArrowRight, RefreshCw } from "lucide-react";

const CommentSyncPage = () => {
  const synced = mockTickets.filter((t) => t.commentSynced);
  const unsynced = mockTickets.filter((t) => !t.commentSynced);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comment Sync</h1>
          <p className="text-sm text-muted-foreground mt-1">Cross-project comment synchronization status</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded bg-card border border-border border-l-4 border-l-success p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Synced</p>
            <p className="text-2xl font-bold text-foreground mt-1">{synced.length}</p>
          </div>
          <div className="rounded bg-card border border-border border-l-4 border-l-warning p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending Sync</p>
            <p className="text-2xl font-bold text-foreground mt-1">{unsynced.length}</p>
          </div>
          <div className="rounded bg-card border border-border border-l-4 border-l-primary p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Linked Projects</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {mockTickets.filter((t) => t.linkedProject).length}
            </p>
          </div>
        </div>

        {/* Pending sync */}
        <div className="rounded bg-card border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-warning" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Pending Synchronization</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Linked</th>
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Last Comment</th>
                <th className="text-center py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {unsynced.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-primary cursor-pointer hover:underline">{t.key}</td>
                  <td className="py-3 px-4 text-foreground truncate max-w-[200px]">{t.summary}</td>
                  <td className="py-3 px-4 text-foreground">{t.project}</td>
                  <td className="py-3 px-4">
                    {t.linkedProject ? (
                      <span className="flex items-center gap-1 text-info">
                        <ArrowRight className="h-3 w-3" /> {t.linkedProject}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground truncate max-w-[200px]">
                    {t.lastComment ? `${t.lastComment.author}: ${t.lastComment.text}` : "—"}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 text-warning">
                      <X className="h-3 w-3" /> Pending
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Synced */}
        <div className="rounded bg-card border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-2">
            <Check className="h-4 w-4 text-success" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Synchronized</span>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Project</th>
                <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Linked</th>
                <th className="text-center py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {synced.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="py-3 px-4 font-mono text-primary">{t.key}</td>
                  <td className="py-3 px-4 text-foreground truncate max-w-[200px]">{t.summary}</td>
                  <td className="py-3 px-4 text-foreground">{t.project}</td>
                  <td className="py-3 px-4">
                    {t.linkedProject ? (
                      <span className="flex items-center gap-1 text-info">
                        <ArrowRight className="h-3 w-3" /> {t.linkedProject}
                      </span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className="inline-flex items-center gap-1 text-success">
                      <Check className="h-3 w-3" /> Synced
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CommentSyncPage;
