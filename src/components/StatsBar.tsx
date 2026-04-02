import { mockTickets } from "@/data/mockData";
import { Activity, AlertTriangle, Eye, Clock, CheckCircle } from "lucide-react";

export function StatsBar() {
  const p1 = mockTickets.filter((t) => t.priority === "P1");
  const unattended = p1.filter((t) => t.isUnattended).length;
  const slaBreached = p1.filter((t) => t.slaBreached).length;
  const needsAttention = p1.filter((t) => t.hasNewActivity && t.lastManagerComment).length;
  const resolved = p1.filter((t) => t.status === "Resolved").length;

  const stats = [
    { label: "Total P1", value: p1.length, icon: Activity, color: "text-primary" },
    { label: "Unattended", value: unattended, icon: Clock, color: "text-critical" },
    { label: "SLA Breached", value: slaBreached, icon: AlertTriangle, color: "text-warning" },
    { label: "Needs Response", value: needsAttention, icon: Eye, color: "text-info" },
    { label: "Resolved", value: resolved, icon: CheckCircle, color: "text-success" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {stats.map((s) => (
        <div
          key={s.label}
          className="rounded-lg border border-border bg-card p-4 flex items-center gap-3 animate-slide-in"
        >
          <s.icon className={`h-5 w-5 ${s.color} shrink-0`} />
          <div>
            <p className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground">{s.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
