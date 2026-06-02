import { useState, useEffect } from "react";
import { MessageCircle, Eye, RotateCcw } from "lucide-react";

const SEEN_KEY = "new_activity_seen_tickets";

// Store: { ticketKey: seenAtTimestamp }
function getSeenTickets(): Record<string, number> {
  try {
    const stored = localStorage.getItem(SEEN_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    // Handle old format (array) — clear it
    if (Array.isArray(parsed)) {
      localStorage.removeItem(SEEN_KEY);
      return {};
    }
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

function markTicketAsSeen(ticketKey: string) {
  try {
    const seen = getSeenTickets();
    seen[ticketKey] = Date.now();
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {}
}

export function clearAllSeenTickets() {
  localStorage.removeItem(SEEN_KEY);
}

export interface NewActivityItem {
  ticketKey: string;
  summary: string;
  lastComment: {
    author: string;
    text: string;
  };
  assignee: string;
  commentedAt: string;
}

interface NewActivityTableProps {
  items: NewActivityItem[];
  isLoading?: boolean;
  onClearCache?: () => void;
  onVisibleCountChange?: (count: number) => void;
}

function extractCommentText(body: string | { type: string; version: number; content?: any }): string {
  if (typeof body === "string") {
    return body;
  }
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
      return JSON.stringify(body).substring(0, 100);
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
  if (secondsAgo < 604800) return `${Math.floor(secondsAgo / 86400)}d ago`;
  return new Date(dateString).toLocaleDateString();
}

export function NewActivityTable({ items, isLoading = false, onClearCache, onVisibleCountChange }: NewActivityTableProps) {
  const [seenTickets, setSeenTickets] = useState<Record<string, number>>({});

  useEffect(() => {
    setSeenTickets(getSeenTickets());
  }, []);

  const handleTicketClick = (ticketKey: string) => {
    markTicketAsSeen(ticketKey);
    setSeenTickets(prev => ({ ...prev, [ticketKey]: Date.now() }));
  };

  const handleClearCache = () => {
    clearAllSeenTickets();
    setSeenTickets({});
    onClearCache?.();
  };

  // Hide ticket ONLY if it was seen AFTER the latest comment
  // If new comment came after seen → show again
  const visibleItems = items.filter(item => {
    const seenAt = seenTickets[item.ticketKey];
    if (!seenAt) return true;
    const lastCommentTime = new Date(item.commentedAt).getTime();
    return lastCommentTime > seenAt;
  });

  const hiddenCount = items.length - visibleItems.length;

  useEffect(() => {
    onVisibleCountChange?.(visibleItems.length);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleItems.length]);

  if (isLoading) {
    return (
      <div className="rounded bg-card border border-border p-4">
        <p className="text-sm text-muted-foreground">Loading new activity...</p>
      </div>
    );
  }

  if (!isLoading && visibleItems.length === 0) {
    return (
      <div className="rounded bg-card border border-border p-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {hiddenCount > 0
            ? `${hiddenCount} ticket(s) hidden (already seen). Click reset to show again.`
            : "No new activity — you're all caught up! ✅"}
        </p>
        {hiddenCount > 0 && (
          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <RotateCcw className="h-3 w-3" /> Reset ({hiddenCount} hidden)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded bg-card border border-border overflow-hidden">
      <div className="px-4 py-2 bg-muted/30 border-b border-border flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Click a ticket to open — it will be removed from this list</span>
        </div>
        {hiddenCount > 0 && (
          <button
            onClick={handleClearCache}
            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <RotateCcw className="h-3 w-3" /> Reset ({hiddenCount} hidden)
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Ticket</th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Summary</th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Last Comment</th>
            <th className="text-left py-3 px-4 font-semibold text-muted-foreground uppercase tracking-wider text-xs">Assignee</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item, idx) => (
            <tr key={item.ticketKey} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? 'bg-muted/5' : ''}`}>
              <td className="py-3 px-4">
                <a
                  href={`https://amla.atlassian.net/browse/${item.ticketKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-sm font-semibold text-primary hover:underline"
                  onClick={() => handleTicketClick(item.ticketKey)}
                >
                  {item.ticketKey}
                </a>
              </td>
              <td className="py-3 px-4">
                <p className="text-sm text-foreground truncate max-w-xs">{item.summary}</p>
              </td>
              <td className="py-3 px-4">
                <div className="flex items-start gap-2">
                  <MessageCircle className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.lastComment.author}</p>
                    <p className="text-xs text-muted-foreground truncate max-w-sm">{item.lastComment.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{formatRelativeTime(item.commentedAt)}</p>
                  </div>
                </div>
              </td>
              <td className="py-3 px-4">
                <p className="text-sm text-foreground">{item.assignee}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
