import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useJiraJQLSearch } from "@/hooks/use-jira-config";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export function AIP1Tickets15Days() {
  const { search, isConfigured } = useJiraJQLSearch();
  const [tickets, setTickets] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    if (!isConfigured) {
      setError("Please configure Jira first");
      return;
    }

    const fetchTickets = async () => {
      setLoading(true);
      setError(null);
      try {
        // JQL for last 15 days P1 tickets
        const jql = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -15d`;

        const response = await search<{ issues: JiraIssue[]; total: number }>(jql, {
          maxResults: 1000,
          fields: ["summary", "status", "priority", "assignee", "components", "labels", "created", "updated"],
        });

        setTickets(response.issues || []);
        setCurrentPage(1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch tickets");
        setTickets([]);
      } finally {
        setLoading(false);
      }
    };

    fetchTickets();
  }, [isConfigured, search]);

  const getPriorityColor = (priority?: string) => {
    if (!priority) return "bg-gray-100 text-gray-800";
    const lower = priority.toLowerCase();
    if (lower.includes("highest") || lower.includes("p0")) return "bg-red-100 text-red-800 border-red-300";
    if (lower.includes("high") || lower.includes("p1")) return "bg-orange-100 text-orange-800 border-orange-300";
    if (lower.includes("medium") || lower.includes("p2")) return "bg-yellow-100 text-yellow-800 border-yellow-300";
    if (lower.includes("low") || lower.includes("p3")) return "bg-blue-100 text-blue-800 border-blue-300";
    return "bg-gray-100 text-gray-800";
  };

  const getStatusColor = (status?: string) => {
    if (!status) return "bg-gray-100 text-gray-800";
    const lower = status.toLowerCase();
    if (lower.includes("done") || lower.includes("resolved")) return "bg-emerald-100 text-emerald-800 border-emerald-300";
    if (lower.includes("in progress")) return "bg-blue-100 text-blue-800 border-blue-300";
    if (lower.includes("waiting") || lower.includes("blocked")) return "bg-amber-100 text-amber-800 border-amber-300";
    if (lower.includes("open") || lower.includes("new")) return "bg-red-100 text-red-800 border-red-300";
    if (lower.includes("qa")) return "bg-purple-100 text-purple-800 border-purple-300";
    return "bg-gray-100 text-gray-800";
  };

  const totalPages = Math.ceil(tickets.length / itemsPerPage);
  const paginatedTickets = tickets.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <div className="rounded-lg bg-card border-2 border-border p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-orange-600" />
          <h2 className="text-lg font-bold text-foreground">P1 Tickets - Last 15 Days</h2>
        </div>
        <div className="text-sm font-semibold text-foreground bg-orange-100 text-orange-800 px-3 py-1 rounded">
          {tickets.length} tickets
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-3 text-muted-foreground">Loading tickets...</p>
        </div>
      )}

      {!loading && tickets.length > 0 && (
        <>
          {/* Per Page Selector */}
          <div className="flex items-center gap-2 justify-end">
            <span className="text-xs font-medium text-foreground">Per page:</span>
            <Select value={itemsPerPage.toString()} onValueChange={(value) => {
              setItemsPerPage(Number(value));
              setCurrentPage(1);
            }}>
              <SelectTrigger className="w-16 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5</SelectItem>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <div className="border border-border rounded-lg overflow-hidden bg-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Ticket</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Summary</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Priority</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Assignee</th>
                    <th className="px-4 py-3 text-left font-semibold text-foreground">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTickets.map((issue) => (
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
                        <Badge className={getPriorityColor(issue.fields.priority?.name)}>
                          {issue.fields.priority?.name || "N/A"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge className={getStatusColor(issue.fields.status.name)}>
                          {issue.fields.status.name}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {issue.fields.assignee?.displayName || "Unassigned"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(issue.fields.updated).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                ← Previous
              </Button>
              <div className="flex gap-2 items-center">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((page) => {
                    return page === 1 || page === totalPages || (page >= currentPage - 1 && page <= currentPage + 1);
                  })
                  .map((page, idx, arr) => (
                    <div key={page}>
                      {idx > 0 && arr[idx - 1] !== page - 1 && <span className="px-2">...</span>}
                      <Button
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setCurrentPage(page)}
                        className="w-10"
                      >
                        {page}
                      </Button>
                    </div>
                  ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next →
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground text-center mt-2">
            Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, tickets.length)} of {tickets.length} tickets
          </div>
        </>
      )}

      {!loading && tickets.length === 0 && !error && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No P1 tickets found in the last 15 days</p>
        </div>
      )}
    </div>
  );
}
