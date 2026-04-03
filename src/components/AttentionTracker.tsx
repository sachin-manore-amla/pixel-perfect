import { useState, useEffect } from "react";
import { Eye, Loader2, ExternalLink } from "lucide-react";
import { useJiraAPI } from "@/hooks/use-jira-config";
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
    assignee?: {
      displayName: string;
    } | null;
    created: string;
    updated: string;
    components?: Array<{ name: string }>;
  };
}

interface BucketType {
  "24h": JiraIssue[];
  "15d": JiraIssue[];
  "30d": JiraIssue[];
}

function getTimeBucket(updatedDate: string): "24h" | "15d" | "30d" | "older" {
  const updated = new Date(updatedDate);
  const now = new Date();
  const diffMs = now.getTime() - updated.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays <= 1) return "24h";
  if (diffDays <= 15) return "15d";
  if (diffDays <= 30) return "30d";
  return "older";
}

function IssueCard({
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
      className={`rounded bg-card border border-border border-l-4 ${borderColor} p-5 animate-slide-in`}
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
          {label}
        </span>
        <div className="flex items-center gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          <span className="text-2xl font-bold text-foreground">{count}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : issues.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4">No tickets in this period</p>
      ) : (
        <>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">
                  Ticket
                </th>
                <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">
                  Summary
                </th>
                <th className="text-left py-1.5 font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {displayIssues.map((issue) => (
                <tr key={issue.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="py-2 font-mono text-primary">
                    <a
                      href={`https://amla.atlassian.net/browse/${issue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-1"
                    >
                      {issue.key}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="py-2 text-foreground truncate max-w-[200px]" title={issue.fields.summary}>
                    {issue.fields.summary}
                  </td>
                  <td className="py-2">
                    <Badge variant="outline" className="text-xs">
                      {issue.fields.status.name}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {count > 5 && (
            <button
              onClick={onViewAll}
              className="text-xs text-primary mt-3 hover:underline font-medium"
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
      <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label} - Status Changes ({issues.length})</DialogTitle>
          <DialogDescription>
            Issues with recent status changes in the specified teams
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Ticket</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Summary</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Status</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Priority</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Assignee</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Updated</th>
              </tr>
            </thead>
            <tbody>
              {issues.map((issue) => (
                <tr key={issue.id} className="border-b border-border hover:bg-muted/50">
                  <td className="py-2 px-2 font-mono text-primary">
                    <a
                      href={`https://amla.atlassian.net/browse/${issue.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline flex items-center gap-2"
                    >
                      {issue.key}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="py-2 px-2 text-foreground">{issue.fields.summary}</td>
                  <td className="py-2 px-2">
                    <Badge variant="outline">{issue.fields.status.name}</Badge>
                  </td>
                  <td className="py-2 px-2">
                    <Badge variant="secondary" className="text-xs">
                      {issue.fields.priority?.name || "N/A"}
                    </Badge>
                  </td>
                  <td className="py-2 px-2 text-muted-foreground">
                    {issue.fields.assignee?.displayName || "Unassigned"}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground text-xs">
                    {new Date(issue.fields.updated).toLocaleString()}
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

export function AttentionTracker() {
  const { get, isConfigured } = useJiraAPI();
  const [buckets, setBuckets] = useState<BucketType>({
    "24h": [],
    "15d": [],
    "30d": [],
  });
  const [loading, setLoading] = useState(false);
  const [selectedBucket, setSelectedBucket] = useState<"24h" | "15d" | "30d" | null>(null);

  // Fetch issues with recent status changes
  useEffect(() => {
    if (!isConfigured) {
      setBuckets({ "24h": [], "15d": [], "30d": [] });
      return;
    }

    const fetchAttentionIssues = async () => {
      setLoading(true);
      try {
        // JQL for issues with recent status changes
        const jql = `project = Z10 AND type IN (Bug, Defect, Task) AND (status CHANGED TO ('Available For QA', 'RFT-HotFix', 'Rejected') AFTER startOfDay("-1d") BEFORE startOfDay() OR (status CHANGED TO Done AFTER startOfDay("-1d") BEFORE startOfDay() AND "QA Required" = NO)) AND status NOT IN (Reopened, Backlog, Analysis, "Dev In Progress", "Ready for Dev", "Code Review") AND "Team[Dropdown]" IN (TechBridge, "Tech Catalyst", "Tech Rocket") ORDER BY status ASC, created DESC`;

        const response = await get<{ issues: JiraIssue[] }>(
          `/search?jql=${encodeURIComponent(jql)}&maxResults=100&fields=summary,status,assignee,priority,labels,components,created,updated`
        );

        // Organize by time buckets based on updated date
        const newBuckets: BucketType = {
          "24h": [],
          "15d": [],
          "30d": [],
        };

        response.issues.forEach((issue) => {
          const bucket = getTimeBucket(issue.fields.updated);
          if (bucket === "24h") {
            newBuckets["24h"].push(issue);
          } else if (bucket === "15d") {
            newBuckets["15d"].push(issue);
          } else if (bucket === "30d" || bucket === "older") {
            newBuckets["30d"].push(issue);
          }
        });

        setBuckets(newBuckets);
      } catch (error) {
        console.error("Failed to fetch attention tracker issues:", error);
        setBuckets({ "24h": [], "15d": [], "30d": [] });
      } finally {
        setLoading(false);
      }
    };

    fetchAttentionIssues();
  }, [isConfigured, get]);

  if (!isConfigured) {
    return (
      <section>
        <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">
          Attention Required
        </h2>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          💡 Please configure Jira in Settings to see attention tracker
        </div>
      </section>
    );
  }

  return (
    <section>
      <h2 className="text-lg font-semibold text-foreground mb-4 uppercase tracking-wide">
        Attention Required
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <IssueCard
          label="Last 24 Hours"
          count={buckets["24h"].length}
          issues={buckets["24h"]}
          borderColor="border-l-critical"
          onViewAll={() => setSelectedBucket("24h")}
          isLoading={loading}
        />
        <IssueCard
          label="Last 15 Days"
          count={buckets["15d"].length}
          issues={buckets["15d"]}
          borderColor="border-l-warning"
          onViewAll={() => setSelectedBucket("15d")}
          isLoading={loading}
        />
        <IssueCard
          label="Last 30 Days"
          count={buckets["30d"].length}
          issues={buckets["30d"]}
          borderColor="border-l-info"
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
