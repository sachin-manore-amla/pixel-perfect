import { mockTickets } from "@/data/mockData";
import { Activity, AlertTriangle, Eye, Clock, CheckCircle } from "lucide-react";

export function StatsBar() {
  const p1 = mockTickets.filter((t) => t.priority === "P1");
  const unattended = p1.filter((t) => t.isUnattended).length;
  const slaBreached = p1.filter((t) => t.slaBreached).length;
  const needsAttention = p1.filter((t) => t.hasNewActivity && t.lastManagerComment).length;
  const resolved = p1.filter((t) => t.status === "Resolved").length;

  const stats = [
    { label: "Total P1", value: p1.length, icon: Activity, borderColor: "border-l-primary" },
    { label: "Unattended", value: unattended, icon: Clock, borderColor: "border-l-critical" },
    { label: "SLA Breached", value: slaBreached, icon: AlertTriangle, borderColor: "border-l-warning" },
    { label: "Needs Response", value: needsAttention, icon: Eye, borderColor: "border-l-info" },
    { label: "Resolved", value: resolved, icon: CheckCircle, borderColor: "border-l-success" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded bg-card border border-border border-l-4 ${s.borderColor} p-4 animate-slide-in`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
          <p className="text-2xl font-bold text-foreground mt-1">{s.value}</p>
        </div>
      ))}
    </div>
  );
}
