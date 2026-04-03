import { useEffect, useState } from "react";
import { useJiraJQLSearch } from "@/hooks/use-jira-config";
import { Target, CircleDot, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    assignee?: { displayName: string } | null;
    priority?: { name: string };
  };
}

interface DetectedAction {
  ticketKey: string;
  owner: string;
  action: string;
  status: "pending" | "done";
  sentiment: "critical" | "urgent" | "moderate";
}

function generateActions(issue: JiraIssue): DetectedAction[] {
  const actions: DetectedAction[] = [];
  const status = issue.fields.status.name.toLowerCase();
  const priority = issue.fields.priority?.name.toLowerCase() || "p2";
  const owner = issue.fields.assignee?.displayName || "Engineering Lead";
  
  let sentiment: "critical" | "urgent" | "moderate" = "moderate";
  if (priority.includes("p0") || priority.includes("highest")) sentiment = "critical";
  else if (priority.includes("p1") || priority.includes("high")) sentiment = "urgent";

  // Generate actions based on status
  if (status.includes("open") || status.includes("new")) {
    actions.push({
      ticketKey: issue.key,
      owner: owner,
      action: "Investigate issue and assign to developer",
      status: "pending",
      sentiment,
    });
  }
  
  if (status.includes("in progress")) {
    actions.push({
      ticketKey: issue.key,
      owner: owner,
      action: "Review progress and identify blockers",
      status: "pending",
      sentiment,
    });
  }
  
  if (!issue.fields.assignee) {
    actions.push({
      ticketKey: issue.key,
      owner: "Manager",
      action: "Assign to available developer immediately",
      status: "pending",
      sentiment: "critical",
    });
  }

  if (status.includes("blocked") || status.includes("waiting")) {
    actions.push({
      ticketKey: issue.key,
      owner: owner,
      action: "Resolve blocker and unblock ticket",
      status: "pending",
      sentiment,
    });
  }

  return actions;
}

export function AIActionDetection() {
  const { search, isConfigured } = useJiraJQLSearch();
  const [actions, setActions] = useState<DetectedAction[]>([]);
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

    const fetchActions = async () => {
      setLoading(true);
      setError(null);
      try {
        const jql = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -1d`;
        const response = await search<{ issues: JiraIssue[] }>(jql, {
          maxResults: 100,
          fields: ["summary", "status", "priority", "assignee"],
        });

        const issues = response.issues || [];
        const allActions = issues.flatMap((issue) => generateActions(issue));
        const pending = allActions.filter((a) => a.status === "pending");
        const done = allActions.filter((a) => a.status === "done");
        
        // Sort by sentiment
        const sorted = [
          ...pending.sort((a, b) => {
            const sentimentOrder = { critical: 0, urgent: 1, moderate: 2 };
            return sentimentOrder[a.sentiment] - sentimentOrder[b.sentiment];
          }),
          ...done,
        ];
        
        setActions(sorted);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch actions");
        setActions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchActions();
  }, [isConfigured, search]);

  const pending = actions.filter((a) => a.status === "pending");
  const done = actions.filter((a) => a.status === "done");

  return (
    <div className="rounded bg-card border border-border p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <Target className="h-4 w-4 text-ai" />
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">AI Action Detection</span>
        <span className="ml-auto text-xs px-2 py-0.5 rounded bg-warning/10 text-warning font-medium">
          {pending.length} pending
        </span>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="h-3 w-3 animate-spin text-primary mr-2" />
          <span className="text-xs text-muted-foreground">Loading actions...</span>
        </div>
      )}

      {error && (
        <div className="text-xs text-critical bg-critical/10 p-2 rounded mb-2">{error}</div>
      )}

      <div className="space-y-2">
        {pending.length > 0 ? (
          pending.slice(0, 8).map((action, i) => (
            <div key={i} className="flex items-start gap-3 p-2.5 border border-border rounded hover:bg-muted/30 transition-colors">
              <CircleDot className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${
                action.sentiment === "critical" ? "text-critical" :
                action.sentiment === "urgent" ? "text-warning" : "text-info"
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  {jiraUrl ? (
                    <a
                      href={`${jiraUrl}/browse/${action.ticketKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary hover:underline transition-colors cursor-pointer"
                    >
                      {action.ticketKey}
                    </a>
                  ) : (
                    <span className="font-mono text-xs text-primary">{action.ticketKey}</span>
                  )}
                  <span className="text-xs text-muted-foreground">→</span>
                  <span className="text-xs font-medium text-foreground">{action.owner}</span>
                </div>
                <p className="text-xs text-muted-foreground">{action.action}</p>
              </div>
              <AlertCircle className="h-3 w-3 text-warning shrink-0 mt-1" />
            </div>
          ))
        ) : (
          !loading && <p className="text-xs text-muted-foreground text-center py-3">No pending actions</p>
        )}

        {done.length > 0 && (
          <div className="pt-2 border-t border-border mt-3">
            <p className="text-xs text-muted-foreground mb-2">Completed</p>
            {done.slice(0, 3).map((action, i) => (
              <div key={i} className="flex items-center gap-3 p-2 opacity-60">
                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                {jiraUrl ? (
                  <a
                    href={`${jiraUrl}/browse/${action.ticketKey}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-primary hover:underline transition-colors cursor-pointer"
                  >
                    {action.ticketKey}
                  </a>
                ) : (
                  <span className="font-mono text-xs">{action.ticketKey}</span>
                )}
                <span className="text-xs text-muted-foreground truncate">{action.owner}: {action.action}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
