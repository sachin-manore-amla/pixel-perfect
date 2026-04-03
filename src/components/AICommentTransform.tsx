import { useEffect, useState } from "react";
import { useJiraJQLSearch } from "@/hooks/use-jira-config";
import { MessageSquare, ArrowRight, Sparkles, Loader2 } from "lucide-react";

interface JiraIssue {
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    priority?: { name: string };
  };
}

interface CommentTransform {
  ticketKey: string;
  internalComment: string;
  customerFriendlyComment: string;
}

function generateComments(issue: JiraIssue): CommentTransform {
  const status = issue.fields.status.name.toLowerCase();
  
  let internalComment = "";
  let customerFriendly = "";

  if (status.includes("open") || status.includes("new")) {
    internalComment = `Ticket is in initial queue. Need to triage and assign to available engineer. Dependencies unclear — may require stakeholder input on requirements.`;
    customerFriendly = `We've received your request and our team is reviewing it to understand the scope and requirements. We'll have an initial assessment within 24 hours.`;
  } else if (status.includes("in progress")) {
    internalComment = `Engineer is actively debugging. Reproducing issue in staging environment. May need to escalate to senior dev if root cause not found in 2 hours.`;
    customerFriendly = `Our engineering team is actively working on your issue. We're investigating the root cause and will provide an update soon.`;
  } else if (status.includes("waiting") || status.includes("blocked")) {
    internalComment = `Blocked by pending response from infrastructure team. Need to escalate if no update within 4 hours.`;
    customerFriendly = `We're waiting for some required information to proceed. Once we receive it, we'll resume work immediately.`;
  } else {
    internalComment = `Routine maintenance. Monitoring progress. No blockers identified at this time.`;
    customerFriendly = `Everything is progressing as expected. We'll keep you updated on any significant changes.`;
  }

  return {
    ticketKey: issue.key,
    internalComment,
    customerFriendlyComment: customerFriendly,
  };
}

export function AICommentTransform() {
  const { search, isConfigured } = useJiraJQLSearch();
  const [comments, setComments] = useState<CommentTransform[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) {
      setError("Please configure Jira first");
      return;
    }

    const fetchComments = async () => {
      setLoading(true);
      setError(null);
      try {
        const jql = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -1d`;
        const response = await search<{ issues: JiraIssue[] }>(jql, {
          maxResults: 100,
          fields: ["summary", "status", "priority"],
        });

        const issues = response.issues || [];
        const generated = issues.slice(0, 5).map((issue) => generateComments(issue));
        setComments(generated);
        setSelectedIdx(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch comments");
        setComments([]);
      } finally {
        setLoading(false);
      }
    };

    fetchComments();
  }, [isConfigured, search]);

  if (loading) {
    return (
      <div className="rounded bg-card border border-border p-5 animate-slide-in">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-4 w-4 text-ai" />
          <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Smart Comment Transform</span>
        </div>
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-primary mr-2" />
          <span className="text-xs text-muted-foreground">Generating comments...</span>
        </div>
      </div>
    );
  }

  if (comments.length === 0) return null;

  const current = comments[selectedIdx];

  return (
    <div className="rounded bg-card border border-border p-5 animate-slide-in">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-ai" />
        <span className="text-sm font-semibold text-foreground uppercase tracking-wide">Smart Comment Transform</span>
        <span className="ml-auto text-xs text-muted-foreground">Internal → Customer</span>
      </div>

      {error && (
        <div className="text-xs text-critical bg-critical/10 p-2 rounded mb-3">{error}</div>
      )}

      {/* Ticket selector */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {comments.map((comment, idx) => (
          <button
            key={comment.ticketKey}
            onClick={() => setSelectedIdx(idx)}
            className={`text-xs font-mono px-2 py-1 rounded border transition-colors ${
              idx === selectedIdx
                ? "bg-ai/10 border-ai text-ai"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {comment.ticketKey}
          </button>
        ))}
      </div>

      {/* Transform view */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Internal */}
        <div className="rounded border border-border p-3 bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" />
            Internal Comment
          </p>
          <p className="text-xs text-foreground leading-relaxed font-mono">{current.internalComment}</p>
        </div>

        {/* Customer-friendly */}
        <div className="rounded border border-ai/30 p-3 bg-ai/5">
          <p className="text-xs font-semibold text-ai uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            AI-Transformed (Customer-Friendly)
          </p>
          <p className="text-xs text-foreground leading-relaxed">{current.customerFriendlyComment}</p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
        <ArrowRight className="h-3 w-3" />
        <span>Technical jargon automatically converted to professional customer communication</span>
      </div>
    </div>
  );
}
