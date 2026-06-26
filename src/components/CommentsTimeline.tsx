import { MessageCircle, AlertCircle } from "lucide-react";

export interface Comment {
  id: string;
  author: {
    displayName: string;
  };
  created: string;
  updated: string;
  body: string | { type: string; version: number; content?: any };
}

interface CommentsTimelineProps {
  comments: Comment[];
  maxComments?: number;
  compact?: boolean;
}

// Helper to extract text from comment body (handles both string and ADF formats)
function extractCommentText(body: string | { type: string; version: number; content?: any }): string {
  if (typeof body === "string") {
    return body;
  }
  // For ADF (Atlassian Document Format), try to extract text from content
  if (typeof body === "object" && body.content) {
    try {
      const texts: string[] = [];
      const extractFromContent = (items: any[]) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
          if (typeof item === "object") {
            if (item.text) texts.push(item.text);
            if (item.content) extractFromContent(item.content);
          }
        }
      };
      extractFromContent(body.content);
      return texts.join(" ");
    } catch (e) {
      return JSON.stringify(body).substring(0, 200);
    }
  }
  return JSON.stringify(body);
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 60) return "just now";
  if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
  if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
  return `${Math.floor(secondsAgo / 86400)}d ago`;
}

export function CommentsTimeline({ comments, maxComments = 5, compact = false }: CommentsTimelineProps) {
  if (!comments || comments.length === 0) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 bg-muted/50 rounded border border-border">
        <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <p className="text-sm text-muted-foreground">No comments on this ticket</p>
      </div>
    );
  }

  const displayComments = comments.slice(-maxComments).reverse();

  // Compact mode: simple list format
  if (compact) {
    return (
      <div className="space-y-2">
        {displayComments.map((comment) => {
          const text = extractCommentText(comment.body);
          const shortText = text.length > 80 ? text.substring(0, 80) + "..." : text;
          
          return (
            <div key={comment.id} className="flex items-start gap-2 text-sm">
              <span className="font-medium text-foreground min-w-fit">
                {comment.author?.displayName || "Unknown"}
              </span>
              <span className="text-muted-foreground">-</span>
              <span className="text-foreground break-words flex-1">{shortText}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Full timeline mode
  return (
    <div className="space-y-3">
      {comments.length > maxComments && (
        <p className="text-xs text-muted-foreground px-2">
          Showing {displayComments.length} of {comments.length} comments
        </p>
      )}
      
      {displayComments.map((comment, idx) => {
        const text = extractCommentText(comment.body);
        const isRecent = new Date(comment.updated).getTime() > new Date().getTime() - 24 * 60 * 60 * 1000;

        return (
          <div
            key={comment.id}
            className={`pb-3 ${idx < displayComments.length - 1 ? "border-b border-border" : ""}`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 flex-shrink-0">
                <div className="h-2 w-2 rounded-full bg-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {comment.author?.displayName || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatRelativeTime(comment.updated)} {isRecent && <span className="ml-1 inline-block px-1.5 py-0.5 bg-info/10 text-info rounded text-xs font-semibold">Recent</span>}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-foreground mt-2 leading-relaxed break-words max-w-full">
                  {text.substring(0, 300)}
                  {text.length > 300 && "..."}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
