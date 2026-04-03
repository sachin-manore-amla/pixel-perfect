import { DashboardLayout } from "@/components/DashboardLayout";
import { mockAlerts, type Alert } from "@/data/mockData";
import { Bell, AlertTriangle, Eye, TrendingUp, Check, Clock, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

const alertIcon = (type: Alert["type"]) => {
  switch (type) {
    case "unattended": return Clock;
    case "sla_breach": return AlertTriangle;
    case "new_activity": return Eye;
    case "escalation": return TrendingUp;
  }
};

const alertColor = (type: Alert["type"]) => {
  switch (type) {
    case "unattended": return "text-warning";
    case "sla_breach": return "text-critical";
    case "new_activity": return "text-info";
    case "escalation": return "text-critical";
  }
};

function formatTime(date: Date) {
  const diff = (Date.now() - date.getTime()) / 60000;
  if (diff < 60) return `${Math.round(diff)}m ago`;
  if (diff < 1440) return `${Math.round(diff / 60)}h ago`;
  return `${Math.round(diff / 1440)}d ago`;
}

const AlertsPage = () => {
  const [alerts, setAlerts] = useState(mockAlerts);
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const acknowledge = (id: string) => {
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  };

  const acknowledgeAll = () => {
    setAlerts((prev) => prev.map((a) => ({ ...a, acknowledged: true })));
  };

  const filtered = typeFilter === "all" ? alerts : alerts.filter((a) => a.type === typeFilter);
  const unack = filtered.filter((a) => !a.acknowledged);
  const acked = filtered.filter((a) => a.acknowledged);

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Alerts</h1>
            <p className="text-sm text-muted-foreground mt-1">Proactive notifications for ticket events</p>
          </div>
          {unack.length > 0 && (
            <button onClick={acknowledgeAll} className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity">
              Acknowledge All ({unack.length})
            </button>
          )}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {["all", "unattended", "sla_breach", "new_activity", "escalation"].map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors capitalize ${
                typeFilter === t
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "all" ? "All" : t.replace("_", " ")}
            </button>
          ))}
        </div>

        {/* Unacknowledged */}
        {unack.length > 0 && (
          <div className="rounded bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-2">
              <Bell className="h-4 w-4 text-critical" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Active Alerts</span>
              <Badge className="ml-auto bg-critical text-critical-foreground text-xs rounded">{unack.length}</Badge>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Message</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
                  <th className="text-right py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {unack.map((alert) => {
                  const Icon = alertIcon(alert.type);
                  return (
                    <tr key={alert.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1.5 ${alertColor(alert.type)}`}>
                          <Icon className="h-3.5 w-3.5" />
                          <span className="capitalize">{alert.type.replace("_", " ")}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-primary cursor-pointer hover:underline">{alert.ticketKey}</td>
                      <td className="py-3 px-4 text-foreground">{alert.message}</td>
                      <td className="py-3 px-4 text-muted-foreground">{formatTime(alert.time)}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => acknowledge(alert.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-xs font-medium"
                        >
                          <Check className="h-3 w-3" /> ACK
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Acknowledged */}
        {acked.length > 0 && (
          <div className="rounded bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acknowledged</span>
            </div>
            <table className="w-full text-xs">
              <tbody>
                {acked.map((alert) => (
                  <tr key={alert.id} className="border-b border-border last:border-0 bg-muted/20 text-muted-foreground">
                    <td className="py-2 px-4"><Check className="h-3 w-3 text-success inline" /></td>
                    <td className="py-2 px-4 font-mono">{alert.ticketKey}</td>
                    <td className="py-2 px-4 truncate">{alert.message}</td>
                    <td className="py-2 px-4">{formatTime(alert.time)}</td>
                    <td className="py-2 px-4 text-right text-success text-xs">Done</td>
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

export default AlertsPage;
