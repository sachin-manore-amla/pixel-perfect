import { DashboardLayout } from "@/components/DashboardLayout";
import { mockTickets, getBucket, type Ticket } from "@/data/mockData";
import { AlertTriangle, Clock, User, Filter } from "lucide-react";
import { useState } from "react";

const statusColor = (status: Ticket["status"]) => {
  switch (status) {
    case "Open": return "bg-critical/10 text-critical";
    case "In Progress": return "bg-info/10 text-info";
    case "Waiting": return "bg-warning/10 text-warning";
    case "Resolved": return "bg-success/10 text-success";
  }
};

const TriagePage = () => {
  const p1Tickets = mockTickets.filter((t) => t.priority === "P1");
  const [bucketFilter, setBucketFilter] = useState<"all" | "24h" | "15d" | "30d">("all");

  const filtered = bucketFilter === "all"
    ? p1Tickets
    : p1Tickets.filter((t) => {
        const b = getBucket(t);
        if (bucketFilter === "30d") return b === "30d" || b === "older";
        return b === bucketFilter;
      });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">P1 Triage</h1>
          <p className="text-sm text-muted-foreground mt-1">Full view of all P1 tickets with filtering and triage actions</p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["all", "24h", "15d", "30d"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBucketFilter(b)}
              className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                bucketFilter === b
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {b === "all" ? "All" : b === "24h" ? "Last 24h" : b === "15d" ? "Last 15 Days" : "Last 30 Days"}
            </button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length} tickets</span>
        </div>

        {/* Ticket table */}
        <div className="rounded bg-card border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Summary</th>
                <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Assignee</th>
                <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="text-left py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Bucket</th>
                <th className="text-right py-2.5 px-4 font-semibold text-muted-foreground uppercase tracking-wider">SLA</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const bucket = getBucket(t);
                const hoursOld = Math.round((Date.now() - t.createdAt.getTime()) / 3600000);
                return (
                  <tr key={t.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono text-primary cursor-pointer hover:underline">{t.key}</span>
                      {t.isUnattended && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-critical pulse-dot inline-block" />}
                    </td>
                    <td className="py-3 px-4 text-foreground max-w-[300px] truncate">{t.summary}</td>
                    <td className="py-3 px-4">
                      <span className={`flex items-center gap-1 ${t.assignee === "Unassigned" ? "text-critical" : "text-foreground"}`}>
                        <User className="h-3 w-3" />
                        {t.assignee}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${statusColor(t.status)}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`text-xs font-mono ${
                        bucket === "24h" ? "text-critical" : bucket === "15d" ? "text-warning" : "text-muted-foreground"
                      }`}>
                        {hoursOld < 24 ? `${hoursOld}h` : `${Math.round(hoursOld / 24)}d`}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {t.slaBreached ? (
                        <span className="inline-flex items-center gap-1 text-critical">
                          <AlertTriangle className="h-3 w-3" />
                          Breached
                        </span>
                      ) : t.slaDeadline ? (
                        <span className="text-muted-foreground">
                          <Clock className="h-3 w-3 inline mr-1" />
                          Active
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default TriagePage;
