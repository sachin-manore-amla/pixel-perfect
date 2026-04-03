import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useJiraJQLSearch } from "@/hooks/use-jira-config";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

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
    labels?: string[];
    components?: Array<{ name: string }>;
  };
}

export default function P1Triage() {
  const { search, isConfigured } = useJiraJQLSearch();
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  // Fetch tickets with status changes in last 24 hours
  useEffect(() => {
    if (!isConfigured) {
      setError("Please configure Jira first");
      return;
    }

    const fetchTriageTickets = async () => {
      setLoading(true);
      setError(null);
      try {
        // JQL query for P1 tickets updated in last 24 hours
        const jql = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -1d`;

        const response = await search<{ issues: JiraIssue[]; total: number }>(
          jql,
          {
            maxResults: 100,
            fields: ["summary", "status", "priority", "assignee", "components", "labels", "created", "updated"],
          }
        );

        setIssues(response.issues);
        setTotalCount(response.total || response.issues.length);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch tickets");
        setIssues([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTriageTickets();
  }, [isConfigured, search]);

  const getPriorityColor = (priority?: string) => {
    switch (priority?.toLowerCase()) {
      case "highest":
      case "p0":
        return "bg-red-100 text-red-800 border-red-300";
      case "high":
      case "p1":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "medium":
      case "p2":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "low":
      case "p3":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getStatusColor = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const lower = status.toLowerCase();
    if (lower.includes("done") || lower.includes("closed")) return "bg-green-100 text-green-800";
    if (lower.includes("in progress") || lower.includes("in review")) return "bg-blue-100 text-blue-800";
    if (lower.includes("rejected") || lower.includes("blocker")) return "bg-red-100 text-red-800";
    if (lower.includes("qa")) return "bg-purple-100 text-purple-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const exportToCSV = () => {
    const headers = ["Ticket", "Summary", "Status", "Priority", "Assignee", "Created", "Updated"];
    const rows = issues.map((issue) => [
      issue.key,
      issue.fields.summary,
      issue.fields.status.name,
      issue.fields.priority?.name || "N/A",
      issue.fields.assignee?.displayName || "Unassigned",
      new Date(issue.fields.created).toLocaleDateString(),
      new Date(issue.fields.updated).toLocaleDateString(),
    ]);

    const csv =
      [headers, ...rows].map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `p1-triage-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  if (!isConfigured) {
    return (
      <DashboardLayout>
        <div className="max-w-7xl mx-auto">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-yellow-800">
            <p className="font-semibold">⚠️ Jira Not Configured</p>
            <p className="mt-1 text-sm">Please go to Settings and configure your Jira instance first.</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">P1 Triage</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tickets requiring immediate attention with recent status changes
          </p>
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              Total Tickets: <span className="text-2xl font-bold text-primary">{totalCount}</span>
            </p>
          </div>
          <Button onClick={exportToCSV} variant="outline" size="sm" disabled={issues.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error loading tickets</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="ml-3 text-muted-foreground">Loading tickets...</p>
          </div>
        )}

        {/* Table */}
        {!loading && issues.length > 0 && (
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Ticket</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Summary</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Assignee</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Created</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Updated</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Labels</th>
                  </tr>
                </thead>
                <tbody>
                  {issues.map((issue) => (
                    <tr key={issue.id} className="border-b border-border hover:bg-muted/50 transition">
                      <td className="px-4 py-3">
                        <a
                          href={`https://amla.atlassian.net/browse/${issue.key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {issue.key}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </td>
                      <td className="px-4 py-3">
                        <p className="truncate max-w-xs" title={issue.fields.summary}>
                          {issue.fields.summary}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(issue.fields.status.name)}>
                          {issue.fields.status.name}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getPriorityColor(issue.fields.priority?.name)}>
                          {issue.fields.priority?.name || "N/A"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {issue.fields.assignee?.displayName || "Unassigned"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(issue.fields.created).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(issue.fields.updated).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {issue.fields.labels?.slice(0, 2).map((label) => (
                            <Badge key={label} variant="secondary" className="text-xs">
                              {label}
                            </Badge>
                          ))}
                          {issue.fields.labels && issue.fields.labels.length > 2 && (
                            <Badge variant="secondary" className="text-xs">
                              +{issue.fields.labels.length - 2}
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && issues.length === 0 && !error && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No tickets found for the current filter</p>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
