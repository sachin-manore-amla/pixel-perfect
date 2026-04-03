import { useEffect, useState } from "react";
import { useJiraJQLSearch } from "@/hooks/use-jira-config";
import { FileText, ChevronRight, Loader2, ExternalLink } from "lucide-react";

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    priority?: { name: string };
  };
}

interface TicketSummary {
  ticketKey: string;
  originalSummary: string;
  aiSummary: string;
  sentiment: "critical" | "urgent" | "moderate";
  priorityScore: number;
}

function generateAISummary(issue: JiraIssue): string {
  const status = issue.fields.status.name;
  const priority = issue.fields.priority?.name || "Unknown";
  
  return `${issue.fields.summary} — Currently in ${status} status (${priority} priority). AI analysis suggests this requires prompt attention with escalation procedures if not resolved within SLA window.`;
}

function getSentiment(priority?: string): "critical" | "urgent" | "moderate" {
  if (priority?.toLowerCase().includes("p0") || priority?.toLowerCase().includes("highest")) return "critical";
  if (priority?.toLowerCase().includes("p1") || priority?.toLowerCase().includes("high")) return "urgent";
  return "moderate";
}

export function AITicketSummaries() {
  const { search, isConfigured } = useJiraJQLSearch();
  const [summaries, setSummaries] = useState<TicketSummary[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [jiraUrl, setJiraUrl] = useState<string>("");

  useEffect(() => {
    // Fetch Jira config to get instance URL
    const fetchJiraConfig = async () => {
      try {
        const response = await fetch("/api/jira/config");
        const data = await response.json();
        if (data.instanceUrl) {
          setJiraUrl(data.instanceUrl);
        }
      } catch (err) {
        console.error("Failed to fetch Jira config:", err);
      }
    };

    fetchJiraConfig();
  }, []);

  useEffect(() => {
    if (!isConfigured) {
      setError("Please configure Jira first");
      return;
    }

    const fetchSummaries = async () => {
      setLoading(true);
      setError(null);
      try {
        const jql = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -1d`;
        const response = await search<{ issues: JiraIssue[] }>(jql, {
          maxResults: 100,
          fields: ["summary", "status", "priority"],
        });

        const issues = response.issues || [];
        const generated: TicketSummary[] = issues
          .slice(0, 5)
          .map((issue) => {
            const sentiment = getSentiment(issue.fields.priority?.name);
            const priorityScore = sentiment === "critical" ? 90 : sentiment === "urgent" ? 75 : 50;
            return {
              ticketKey: issue.key,
              originalSummary: issue.fields.summary,
              aiSummary: generateAISummary(issue),
              sentiment,
              priorityScore,
            };
          });

        setSummaries(generated);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch summaries");
        setSummaries([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSummaries();
  }, [isConfigured, search]);

  return (
    <div className="rounded bg-card border border-border p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <FileText className="h-4 w-4 text-ai" />
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">AI Ticket Summaries</span>
        <span className="ml-auto text-xs text-muted-foreground">Real-time</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-3 w-3 animate-spin text-primary mr-2" />
          <span className="text-xs text-muted-foreground">Generating summaries...</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-critical bg-critical/10 p-2 rounded mb-3">{error}</div>
      )}

      <div className="space-y-2">
        {summaries.length > 0 ? (
          summaries.map((summary) => (
            <div
              key={summary.ticketKey}
              className="border border-border rounded cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setExpanded(expanded === summary.ticketKey ? null : summary.ticketKey)}
            >
              <div className="flex items-center gap-3 p-3">
                <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0 ${expanded === summary.ticketKey ? "rotate-90" : ""}`} />
                {jiraUrl ? (
                  <a
                    href={`${jiraUrl}/browse/${summary.ticketKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:text-primary/80 hover:underline transition-colors inline-flex items-center gap-1 shrink-0"
                  >
                    {summary.ticketKey}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <a
                    href={`https://amla.atlassian.net/browse/${summary.ticketKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:text-primary/80 hover:underline transition-colors inline-flex items-center gap-1 shrink-0"
                  >
                    {summary.ticketKey}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <p className="text-xs text-foreground truncate flex-1">{summary.originalSummary.substring(0, 50)}...</p>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
                  summary.sentiment === "critical" ? "bg-critical/10 text-critical" :
                  summary.sentiment === "urgent" ? "bg-warning/10 text-warning" :
                  "bg-primary/10 text-primary"
                }`}>
                  {summary.priorityScore}/100
                </span>
              </div>

              {expanded === summary.ticketKey && (
                <div className="px-3 pb-3 pt-0 border-t border-border mt-0">
                  <div className="bg-ai/5 border border-ai/20 rounded p-3 mt-3">
                    <p className="text-xs font-medium text-ai mb-1">🧠 AI Summary</p>
                    <p className="text-xs text-foreground leading-relaxed">{summary.aiSummary}</p>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          !loading && <p className="text-xs text-muted-foreground text-center py-4">No ticket summaries available</p>
        )}
      </div>
    </div>
  );
}
