import { useState, useEffect } from "react";
import { Clock, AlertTriangle, TrendingUp, Loader2, ExternalLink } from "lucide-react";
import { useJiraJQLSearch } from "@/hooks/use-jira-config";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface JiraIssue {
  key: string;
  id: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    priority?: {
      name: string;
    };
    created: string;
    updated: string;
    assignee?: {
      displayName: string;
    } | null;
  };
}

interface BucketType {
  "24h": JiraIssue[];
  "15d": JiraIssue[];
  "30d": JiraIssue[];
}

function getTimeBucket(createdDate: string): "24h" | "15d" | "30d" | "older" {
  const created = new Date(createdDate);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 1) return "24h";
  if (diffDays <= 15) return "15d";
  if (diffDays <= 30) return "30d";
  return "older";
}

function getPriorityColor(priority?: string) {
  if (!priority) return "bg-gray-100 text-gray-800 border-gray-300";
  const lower = priority.toLowerCase();
  if (lower.includes("highest") || lower.includes("p0")) return "bg-red-100 text-red-800 border-red-300";
  if (lower.includes("high") || lower.includes("p1")) return "bg-orange-100 text-orange-800 border-orange-300";
  if (lower.includes("medium") || lower.includes("p2")) return "bg-yellow-100 text-yellow-800 border-yellow-300";
  if (lower.includes("low") || lower.includes("p3")) return "bg-blue-100 text-blue-800 border-blue-300";
  return "bg-gray-100 text-gray-800 border-gray-300";
}

function getStatusColor(status?: string) {
  if (!status) return "bg-gray-100 text-gray-800 border-gray-300";
  const lower = status.toLowerCase();
  if (lower.includes("done") || lower.includes("resolved")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (lower.includes("in progress")) return "bg-blue-100 text-blue-800 border-blue-300";
  if (lower.includes("waiting") || lower.includes("blocked")) return "bg-amber-100 text-amber-800 border-amber-300";
  if (lower.includes("open") || lower.includes("new")) return "bg-red-100 text-red-800 border-red-300";
  if (lower.includes("qa")) return "bg-purple-100 text-purple-800 border-purple-300";
  return "bg-gray-100 text-gray-800 border-gray-300";
}

function BucketCard({
  label,
  count,
  issues,
  borderColor,
  onViewAll,
  isLoading,
}: {
  label: string;
  count: number;
  issues: JiraIssue[];
  borderColor: string;
  onViewAll: () => void;
  isLoading: boolean;
}) {
  const displayIssues = issues.slice(0, 5);

  return (
    <div
      className={`rounded-lg bg-card border-2 border-border border-l-4 ${borderColor} p-6 animate-slide-in shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-center justify-between mb-5">
        <span className="text-sm font-bold text-foreground uppercase tracking-widest">
          {label}
        </span>
        <div className="flex items-center gap-3">
          {isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
          <span className="text-3xl font-bold text-primary">{count}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : issues.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No P1 tickets in this period</p>
      ) : (
        <>
          <div className="space-y-2">
            {displayIssues.map((issue) => (
              <div key={issue.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/60 transition-colors">
                <a
                  href={`https://amla.atlassian.net/browse/${issue.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm font-semibold text-primary hover:underline flex items-center gap-2 min-w-0"
                >
                  {issue.key}
                  <ExternalLink className="h-3.5 w-3.5 flex-shrink-0" />
                </a>
                <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                  <div className={`px-2.5 py-1 rounded text-xs font-semibold border ${getPriorityColor(issue.fields.priority?.name)}`}>
                    {issue.fields.priority?.name || "N/A"}
                  </div>
                  <div className={`px-2.5 py-1 rounded text-xs font-semibold border ${getStatusColor(issue.fields.status.name)}`}>
                    {issue.fields.status.name}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {count > 5 && (
            <button
              onClick={onViewAll}
              className="text-sm text-primary font-semibold mt-4 hover:text-primary/80 transition-colors w-full py-2 rounded border border-primary/30 hover:border-primary/60 hover:bg-primary/5"
            >
              View All ({count})
            </button>
          )}
        </>
      )}
    </div>
  );
}

function AllIssuesModal({
  label,
  issues,
  open,
  onOpenChange,
}: {
  label: string;
  issues: JiraIssue[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{label}</DialogTitle>
          <DialogDescription className="text-base">
            Complete list of P1 priority tickets for this time period ({issues.length} total)
          </DialogDescription>
        </DialogHeader>

        <div className="mt-6">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted border-b-2 border-border">
              <tr>
                <th className="text-left py-3 px-3 font-bold text-foreground">Ticket</th>
                <th className="text-left py-3 px-3 font-bold text-foreground">Summary</th>
                <th className="text-left py-3 px-3 font-bold text-foreground">Priority</th>
                <th className="text-left py-3 px-3 font-bold text-foreground">Status</th>
                <th className="text-left py-3 px-3 font-bold text-foreground">Assignee</th>
                <th className="text-left py-3 px-3 font-bold text-foreground">Created</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-3 font-mono font-semibold text-primary">
                    <a
                      href={`https://amla.atlassian.net/browse/${issue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline inline-flex items-center gap-2"
                    >
                      {issue.key}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </td>
                  <td className="py-3 px-3 text-foreground text-sm">{issue.fields.summary}</td>
                  <td className="py-3 px-3">
                    <div className={`px-2.5 py-1 rounded text-xs font-semibold border w-fit ${getPriorityColor(issue.fields.priority?.name)}`}>
                      {issue.fields.priority?.name || "N/A"}
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <div className={`px-2.5 py-1 rounded text-xs font-semibold border w-fit ${getStatusColor(issue.fields.status.name)}`}>
                      {issue.fields.status.name}
                    </div>
                  </td>
                  <td className="py-3 px-3 text-muted-foreground text-sm">
                    {issue.fields.assignee?.displayName || "Unassigned"}
                  </td>
                  <td className="py-3 px-3 text-muted-foreground text-xs">
                    {new Date(issue.fields.created).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function P1BucketSection() {
  const { search, isConfigured } = useJiraJQLSearch();
  const [buckets, setBuckets] = useState<BucketType>({
    "24h": [],
    "15d": [],
    "30d": [],
  });
  const [loading, setLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<"24h" | "15d" | "30d" | null>(null);

  // Fetch P1 tickets from Jira
  useEffect(() => {
    if (!isConfigured) {
      setBuckets({ "24h": [], "15d": [], "30d": [] });
      return;
    }

    const fetchP1Tickets = async () => {
      setLoading(true);
      try {
        const results: BucketType = {
          "24h": [],
          "15d": [],
          "30d": [],
        };

        // Fetch Last 24 Hours
        const jql24h = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -1d`;
        const response24h = await search<{ issues: JiraIssue[]; total: number }>(
          jql24h,
          {
            maxResults: 100,
            fields: ["summary", "status", "priority", "assignee", "components", "labels", "created", "updated"],
          }
        );
        results["24h"] = response24h.issues || [];

        // Fetch Last 15 Days
        const jql15d = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -15d`;
        const response15d = await search<{ issues: JiraIssue[]; total: number }>(
          jql15d,
          {
            maxResults: 100,
            fields: ["summary", "status", "priority", "assignee", "components", "labels", "created", "updated"],
          }
        );
        results["15d"] = response15d.issues || [];

        // Fetch Last 30 Days
        const jql30d = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -30d`;
        const response30d = await search<{ issues: JiraIssue[]; total: number }>(
          jql30d,
          {
            maxResults: 100,
            fields: ["summary", "status", "priority", "assignee", "components", "labels", "created", "updated"],
          }
        );
        results["30d"] = response30d.issues || [];

        setBuckets(results);
      } catch (error) {
        console.error("Failed to fetch P1 tickets:", error);
        setBuckets({ "24h": [], "15d": [], "30d": [] });
      } finally {
        setLoading(false);
      }
    };

    fetchP1Tickets();
  }, [isConfigured, search]);

  if (!isConfigured) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">
          P1 Ticket Buckets
        </h2>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          💡 Please configure Jira in Settings to see P1 tickets
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">
        P1 Ticket Buckets
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <BucketCard
          label="Last 24 Hours"
          count={buckets["24h"].length}
          issues={buckets["24h"]}
          borderColor="border-l-critical"
          onViewAll={() => setSelectedBucket("24h")}
          isLoading={loading}
        />
        <BucketCard
          label="Last 15 Days"
          count={buckets["15d"].length}
          issues={buckets["15d"]}
          borderColor="border-l-warning"
          onViewAll={() => setSelectedBucket("15d")}
          isLoading={loading}
        />
        <BucketCard
          label="Last 30 Days"
          count={buckets["30d"].length}
          issues={buckets["30d"]}
          borderColor="border-l-primary"
          onViewAll={() => setSelectedBucket("30d")}
          isLoading={loading}
        />
      </div>

      {selectedBucket && (
        <AllIssuesModal
          label={
            selectedBucket === "24h"
              ? "Last 24 Hours"
              : selectedBucket === "15d"
                ? "Last 15 Days"
                : "Last 30 Days"
          }
          issues={buckets[selectedBucket]}
          open={!!selectedBucket}
          onOpenChange={(open) => {
            if (!open) setSelectedBucket(null);
          }}
        />
      )}
    </section>
  );
}
