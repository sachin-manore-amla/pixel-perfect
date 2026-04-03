import { useState, useEffect } from "react";
import { useJiraJQLSearch } from "@/hooks/use-jira-config";
import { Brain, TrendingUp, TrendingDown, Loader2 } from "lucide-react";

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string } | null;
    created: string;
    updated: string;
  };
}

interface AIInsight {
  ticketKey: string;
  priorityScore: number;
  priorityReason: string;
  sentiment: "critical" | "urgent" | "moderate" | "stable";
}

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 85 ? "bg-critical" : score >= 65 ? "bg-warning" : "bg-primary";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-xs font-bold font-mono ${score >= 85 ? "text-critical" : score >= 65 ? "text-warning" : "text-foreground"}`}>
        {score}
      </span>
    </div>
  );
}

function calculatePriorityScore(issue: JiraIssue): number {
  let score = 50; // Base score

  // Status scoring
  const status = issue.fields.status.name.toLowerCase();
  if (status.includes("open") || status.includes("new")) score += 20;
  if (status.includes("in progress")) score += 10;
  if (status.includes("blocked") || status.includes("waiting")) score += 15;

  // Assignee scoring
  if (!issue.fields.assignee) score += 20; // Unassigned = higher priority

  // Age scoring (older tickets = higher priority)
  const createdDate = new Date(issue.fields.created);
  const now = new Date();
  const ageHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);
  if (ageHours > 24) score += 15;
  if (ageHours > 12) score += 10;

  // Updated recently = high priority
  const updatedDate = new Date(issue.fields.updated);
  const hoursAgo = (now.getTime() - updatedDate.getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 1) score += 10;

  // Priority field
  const priority = issue.fields.priority?.name.toLowerCase();
  if (priority?.includes("highest") || priority?.includes("p0")) score += 20;
  if (priority?.includes("high") || priority?.includes("p1")) score += 15;

  return Math.min(100, Math.max(0, score));
}

function getSentiment(score: number): "critical" | "urgent" | "moderate" | "stable" {
  if (score >= 85) return "critical";
  if (score >= 65) return "urgent";
  if (score >= 45) return "moderate";
  return "stable";
}

function getPriorityReason(issue: JiraIssue, score: number): string {
  const status = issue.fields.status.name;
  const isUnassigned = !issue.fields.assignee;
  const createdDate = new Date(issue.fields.created);
  const now = new Date();
  const ageHours = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60);

  if (score >= 85) {
    if (isUnassigned) return `Critical — ${issue.fields.summary.substring(0, 40)}... [UNASSIGNED for ${Math.round(ageHours)}h]`;
    return `High priority — ${status} status, requires immediate attention`;
  }
  if (score >= 65) {
    return `Urgent — ${status}, created ${Math.round(ageHours)}h ago`;
  }
  return `Moderate — ${status}, needs follow-up`;
}

export function AIPriorityScoring() {
  const { search, isConfigured } = useJiraJQLSearch();
  const [insights, setInsights] = useState<AIInsight[]>([]);
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

    const fetchInsights = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch P1 tickets from last 7 days
        const jql = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -7d`;
        const response = await search<{ issues: JiraIssue[] }>(jql, {
          maxResults: 100,
          fields: ["summary", "status", "priority", "assignee", "created", "updated"],
        });

        const issues = response.issues || [];
        const generatedInsights: AIInsight[] = issues.map((issue) => {
          const score = calculatePriorityScore(issue);
          return {
            ticketKey: issue.key,
            priorityScore: score,
            priorityReason: getPriorityReason(issue, score),
            sentiment: getSentiment(score),
          };
        });

        // Sort by priority score descending
        setInsights(generatedInsights.sort((a, b) => b.priorityScore - a.priorityScore));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch data");
        setInsights([]);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [isConfigured, search]);

  return (
    <div className="rounded bg-card border border-border p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="h-4 w-4 text-ai" />
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">AI Priority Scoring</span>
        <span className="ml-auto text-xs text-muted-foreground">Real-time • Last 7d</span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
          <span className="text-xs text-muted-foreground">Loading tickets...</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-critical bg-critical/10 p-2 rounded mb-3">{error}</div>
      )}

      <div className="space-y-3">
        {insights.length > 0 ? (
          insights.map((insight) => (
            <div key={insight.ticketKey} className="border border-border rounded p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  {jiraUrl ? (
                    <a
                      href={`${jiraUrl}/browse/${insight.ticketKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary cursor-pointer hover:underline transition-colors"
                    >
                      {insight.ticketKey}
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-primary cursor-pointer hover:underline">{insight.ticketKey}</span>
                  )}
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    insight.sentiment === "critical" ? "bg-critical/10 text-critical" :
                    insight.sentiment === "urgent" ? "bg-warning/10 text-warning" :
                    "bg-primary/10 text-primary"
                  }`}>
                    {insight.sentiment}
                  </span>
                </div>
                {insight.priorityScore >= 85 ? (
                  <TrendingUp className="h-3.5 w-3.5 text-critical" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <ScoreBar score={insight.priorityScore} />
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{insight.priorityReason}</p>
            </div>
          ))
        ) : (
          !loading && <p className="text-xs text-muted-foreground text-center py-4">No tickets found</p>
        )}
      </div>
    </div>
  );
}
