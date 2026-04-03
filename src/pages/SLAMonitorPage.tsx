import { DashboardLayout } from "@/components/DashboardLayout";
import { mockTickets } from "@/data/mockData";
import { Clock, AlertTriangle, CheckCircle, Timer, ShieldAlert } from "lucide-react";

const SLAMonitorPage = () => {
  const p1 = mockTickets.filter((t) => t.priority === "P1");
  const breached = p1.filter((t) => t.slaBreached);
  const atRisk = p1.filter((t) => !t.slaBreached && t.slaDeadline);
  const healthy = p1.filter((t) => !t.slaBreached && !t.slaDeadline);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">SLA Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">Service Level Agreement tracking for all P1 tickets</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Total P1", value: p1.length, icon: Timer, color: "border-l-primary" },
            { label: "SLA Breached", value: breached.length, icon: ShieldAlert, color: "border-l-critical" },
            { label: "At Risk", value: atRisk.length, icon: AlertTriangle, color: "border-l-warning" },
            { label: "Healthy", value: healthy.length, icon: CheckCircle, color: "border-l-success" },
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

        {/* Breached */}
        {breached.length > 0 && (
          <div className="rounded bg-card border border-border border-l-4 border-l-critical overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-critical" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">SLA Breached</span>
              <span className="ml-auto text-xs text-critical font-bold">{breached.length}</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-right py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Breach Time</th>
                </tr>
              </thead>
              <tbody>
                {breached.map((t) => {
                  const breachHours = t.slaDeadline
                    ? Math.round((Date.now() - t.slaDeadline.getTime()) / 3600000)
                    : null;
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-primary cursor-pointer hover:underline">{t.key}</td>
                      <td className="py-3 px-4 text-foreground truncate max-w-[250px]">{t.summary}</td>
                      <td className="py-3 px-4">
                        {t.assignee === "Unassigned"
                          ? <span className="text-critical font-medium">Unassigned</span>
                          : <span className="text-foreground">{t.assignee}</span>}
                      </td>
                      <td className="py-3 px-4 text-foreground">{t.status}</td>
                      <td className="py-3 px-4 text-right font-mono text-critical font-bold">
                        {breachHours !== null ? (breachHours < 24 ? `${breachHours}h ago` : `${Math.round(breachHours / 24)}d ago`) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* At Risk */}
        {atRisk.length > 0 && (
          <div className="rounded bg-card border border-border border-l-4 border-l-warning overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">At Risk</span>
              <span className="ml-auto text-xs text-warning font-bold">{atRisk.length}</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                  <th className="text-right py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Time Remaining</th>
                </tr>
              </thead>
              <tbody>
                {atRisk.map((t) => {
                  const minsLeft = t.slaDeadline ? Math.round((t.slaDeadline.getTime() - Date.now()) / 60000) : 0;
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-primary cursor-pointer hover:underline">{t.key}</td>
                      <td className="py-3 px-4 text-foreground truncate max-w-[250px]">{t.summary}</td>
                      <td className="py-3 px-4 text-foreground">{t.assignee}</td>
                      <td className="py-3 px-4 text-right font-mono text-warning font-bold">
                        {minsLeft > 0 ? (minsLeft < 60 ? `${minsLeft}m` : `${Math.round(minsLeft / 60)}h`) : "Imminent"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Healthy */}
        {healthy.length > 0 && (
          <div className="rounded bg-card border border-border border-l-4 border-l-success overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-success" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Healthy</span>
            </div>
            <table className="w-full text-xs">
              <tbody>
                {healthy.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-primary">{t.key}</td>
                    <td className="py-2.5 px-4 text-foreground truncate max-w-[300px]">{t.summary}</td>
                    <td className="py-2.5 px-4 text-foreground">{t.assignee}</td>
                    <td className="py-2.5 px-4 text-right text-success text-xs">OK</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default SLAMonitorPage;
