import { mockAlerts, type Alert } from "@/data/mockData";
import { Bell, AlertTriangle, Eye, TrendingUp, Check, Clock } from "lucide-react";
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

export function AlertsPanel() {
  const [alerts, setAlerts] = useState(mockAlerts);

  const acknowledge = (id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a))
    );
  };

  const unack = alerts.filter((a) => !a.acknowledged);
  const acked = alerts.filter((a) => a.acknowledged);

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground uppercase tracking-wide">Recent Alerts</h2>
        {unack.length > 0 && (
          <Badge className="bg-critical text-critical-foreground text-xs rounded">
            {unack.length} new
          </Badge>
        )}
      </div>

      <div className="rounded bg-card border border-border overflow-hidden animate-slide-in">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
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
                      <Check className="h-3 w-3" />
                      ACK
                    </button>
                  </td>
                </tr>
              );
            })}
            {acked.length > 0 && acked.slice(0, 2).map((alert) => (
              <tr key={alert.id} className="border-b border-border bg-muted/20 text-muted-foreground">
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
    </section>
  );
}
