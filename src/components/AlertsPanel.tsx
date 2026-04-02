import { mockAlerts, type Alert } from "@/data/mockData";
import { Bell, AlertTriangle, Eye, TrendingUp, Check } from "lucide-react";
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

import { Clock } from "lucide-react";

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
      <div className="flex items-center gap-2 mb-4">
        <Bell className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Recent Alerts</h2>
        {unack.length > 0 && (
          <Badge className="bg-critical text-critical-foreground text-xs font-mono">
            {unack.length} new
          </Badge>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden animate-slide-in">
        {unack.map((alert) => {
          const Icon = alertIcon(alert.type);
          return (
            <div
              key={alert.id}
              className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors"
            >
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${alertColor(alert.type)}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">{alert.ticketKey}</span>
                  <Badge variant="outline" className="text-xs capitalize border-border">
                    {alert.type.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-sm text-foreground mt-1">{alert.message}</p>
                <span className="text-xs text-muted-foreground mt-1 block">{formatTime(alert.time)}</span>
              </div>
              <button
                onClick={() => acknowledge(alert.id)}
                className="shrink-0 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Acknowledge"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {acked.length > 0 && (
          <div className="p-3 bg-muted/20">
            <p className="text-xs text-muted-foreground mb-2">Acknowledged ({acked.length})</p>
            {acked.slice(0, 2).map((alert) => (
              <div key={alert.id} className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                <Check className="h-3 w-3 text-success" />
                <span className="font-mono">{alert.ticketKey}</span>
                <span className="truncate">{alert.message}</span>
              </div>
            ))}
            {acked.length > 2 && (
              <p className="text-xs text-muted-foreground mt-1">+{acked.length - 2} more</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
