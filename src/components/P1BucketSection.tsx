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
        <p className="text-xs text-muted-foreground py-4">No P1 tickets in this period</p>
      ) : (
        <>
          <div className="space-y-2">
            {displayIssues.map((issue) => (
              <div key={issue.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50">
                <a
                  href={`https://amla.atlassian.net/browse/${issue.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline flex items-center gap-1"
                >
                  {issue.key}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ))}
          </div>
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
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label} - All P1 Tickets ({issues.length})</DialogTitle>
          <DialogDescription>
            Complete list of P1 priority tickets for this time period
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card border-b border-border">
              <tr>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Ticket</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Summary</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Status</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Assignee</th>
                <th className="text-left py-2 px-2 font-semibold text-foreground">Created</th>
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
                  <td className="py-2 px-2 text-muted-foreground">
                    {issue.fields.assignee?.displayName || "Unassigned"}
                  </td>
                  <td className="py-2 px-2 text-muted-foreground text-xs">
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
