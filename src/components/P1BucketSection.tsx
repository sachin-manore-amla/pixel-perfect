import { mockTickets, getBucket, type Ticket } from "@/data/mockData";
import { Clock, AlertTriangle, TrendingUp } from "lucide-react";

function BucketCard({
  label,
  count,
  tickets,
  borderColor,
}: {
  label: string;
  count: number;
  tickets: Ticket[];
  borderColor: string;
}) {
  return (
    <div className={`rounded bg-card border border-border border-l-4 ${borderColor} p-5 animate-slide-in`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">{label}</span>
        <span className="text-2xl font-bold text-foreground">{count}</span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
            <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
            <th className="text-right py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {tickets.slice(0, 3).map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <td className="py-2 font-mono text-primary cursor-pointer hover:underline">{t.key}</td>
              <td className="py-2 text-foreground truncate max-w-[180px]">{t.summary}</td>
              <td className="py-2 text-right">
                <span className={`inline-flex items-center gap-1 ${t.isUnattended ? 'text-critical' : t.slaBreached ? 'text-warning' : 'text-muted-foreground'}`}>
                  {t.isUnattended && <span className="h-1.5 w-1.5 rounded-full bg-critical pulse-dot" />}
                  {t.slaBreached && <AlertTriangle className="h-3 w-3" />}
                  {t.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {tickets.length > 3 && (
        <p className="text-xs text-primary mt-2 cursor-pointer hover:underline">View All ({tickets.length})</p>
      )}
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
      <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">P1 Ticket Buckets</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BucketCard label="Last 24 Hours" count={buckets["24h"].length} tickets={buckets["24h"]} borderColor="border-l-critical" />
        <BucketCard label="Last 15 Days" count={buckets["15d"].length} tickets={buckets["15d"]} borderColor="border-l-warning" />
        <BucketCard label="Last 30 Days" count={buckets["30d"].length} tickets={buckets["30d"]} borderColor="border-l-primary" />
      </div>
    </section>
  );
}
