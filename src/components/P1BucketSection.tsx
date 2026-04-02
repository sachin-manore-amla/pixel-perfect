import { mockTickets, getBucket, type Ticket } from "@/data/mockData";
import { Clock, AlertTriangle, TrendingUp } from "lucide-react";

function BucketCard({
  label,
  count,
  tickets,
  icon: Icon,
  accentClass,
  glowClass,
}: {
  label: string;
  count: number;
  tickets: Ticket[];
  icon: React.ElementType;
  accentClass: string;
  glowClass: string;
}) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${glowClass} animate-slide-in`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${accentClass}`} />
          <span className="text-sm font-medium text-foreground">{label}</span>
        </div>
        <span className={`text-2xl font-bold font-mono ${accentClass}`}>{count}</span>
      </div>
      <div className="space-y-2">
        {tickets.slice(0, 3).map((t) => (
          <div key={t.id} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-mono text-muted-foreground">{t.key}</span>
              <span className="text-foreground truncate">{t.summary}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              {t.isUnattended && <span className="h-1.5 w-1.5 rounded-full bg-critical pulse-dot" />}
              {t.slaBreached && <AlertTriangle className="h-3 w-3 text-warning" />}
            </div>
          </div>
        ))}
        {tickets.length > 3 && (
          <p className="text-xs text-muted-foreground">+{tickets.length - 3} more</p>
        )}
      </div>
    </div>
  );
}

export function P1BucketSection() {
  const p1Tickets = mockTickets.filter((t) => t.priority === "P1");
  const buckets = {
    "24h": p1Tickets.filter((t) => getBucket(t) === "24h"),
    "15d": p1Tickets.filter((t) => getBucket(t) === "15d"),
    "30d": p1Tickets.filter((t) => getBucket(t) === "30d" || getBucket(t) === "older"),
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">P1 Ticket Buckets</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BucketCard
          label="Last 24 Hours"
          count={buckets["24h"].length}
          tickets={buckets["24h"]}
          icon={Clock}
          accentClass="text-critical"
          glowClass="glow-critical"
        />
        <BucketCard
          label="Last 15 Days"
          count={buckets["15d"].length}
          tickets={buckets["15d"]}
          icon={Clock}
          accentClass="text-warning"
          glowClass="glow-warning"
        />
        <BucketCard
          label="Last 30 Days"
          count={buckets["30d"].length}
          tickets={buckets["30d"]}
          icon={Clock}
          accentClass="text-primary"
          glowClass="glow-primary"
        />
      </div>
    </section>
  );
}
