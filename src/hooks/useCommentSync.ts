import { useState, useCallback } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "";

/** Safe JSON parser — returns {} instead of throwing on empty/invalid body */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safeJson(res: Response): Promise<any> {
  try {
    const text = await res.text();
    if (!text || !text.trim()) return {};
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export interface SyncRecord {
  id: string;
  sourceKey: string;
  targetKey: string;
  direction: string;
  commentId: string;
  originalComment: string;
  transformedComment: string;
  author: string;
  syncedBy?: string;
  timestamp: string;
  status: "success" | "failed";
  error?: string;
}

export interface PendingComment {
  issueKey: string;
  targetKeys: string[];
  commentId: string;
  commentBody: string;
  commentBodyHtml: string;
  author: string;
  authorAccountId: string;
  created: string;
  direction: string;
  mentions: string[];
  authorizedToPost: boolean;
  boardId: number | null;
  boardName: string;
  attachmentCount: number;
  attachments: Array<{ name: string; url: string | null }>;
  externalLinkCount: number;
  externalLinks: string[];
}

export interface SyncAllSummary {
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
}

export function useCommentSync() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [syncHistory, setSyncHistory] = useState<SyncRecord[]>([]);
  const [pendingComments, setPendingComments] = useState<PendingComment[]>([]);
  const [scanStats, setScanStats] = useState<{ scanned: number; found: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Trigger AI transform + post to linked ticket for a single comment */
  const syncComment = useCallback(
    async (
      issueKey: string,
      commentBody: string,
      commentId: string,
      author = "Unknown",
      authorizedToPost = true,
      syncedBy?: string
    ): Promise<SyncRecord> => {
      setIsSyncing(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/jira/sync-comment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueKey, commentBody, commentId, author, syncedBy, authorizedToPost }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Sync failed");

        const record: SyncRecord = data.record;
        setSyncHistory((prev) => [record, ...prev]);
        setPendingComments((prev) =>
          prev.filter((p) => !(p.issueKey === issueKey && p.commentId === commentId))
        );
        return record;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Sync failed";
        setError(msg);
        throw e;
      } finally {
        setIsSyncing(false);
      }
    },
    []
  );

  /** Bulk-sync all pending comments in a single request */
  const syncAll = useCallback(
    async (comments: PendingComment[], syncedBy?: string): Promise<SyncAllSummary> => {
      setIsSyncingAll(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/jira/sync-all`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comments: comments.map((c) => ({
              issueKey: c.issueKey,
              commentBody: c.commentBody,
              commentId: c.commentId,
              author: c.author,
              syncedBy,
            })),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Bulk sync failed");

        const summary: SyncAllSummary = data.summary;
        const newRecords: SyncRecord[] = (data.results || [])
          .filter((r: { record?: SyncRecord }) => r.record)
          .map((r: { record: SyncRecord }) => r.record);

        setSyncHistory((prev) => [...newRecords, ...prev]);

        // Remove successfully synced from pending
        const successIds = new Set(
          (data.results || [])
            .filter((r: { status: string; commentId: string }) => r.status === "success" || r.status === "skipped")
            .map((r: { commentId: string }) => r.commentId)
        );
        setPendingComments((prev) => prev.filter((p) => !successIds.has(p.commentId)));

        return summary;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bulk sync failed";
        setError(msg);
        throw e;
      } finally {
        setIsSyncingAll(false);
      }
    },
    []
  );

  /**
   * Auto-discover: JQL-scans selected projects for sync hashtags.
   * No manual ticket entry needed.
   */
  const autoDiscover = useCallback(
    async (days = 1, maxIssues = 200, projectKeys: string[] = []): Promise<PendingComment[]> => {
      setIsDiscovering(true);
      setError(null);
      setScanStats(null);
      try {
        const res = await fetch(`${API_BASE}/api/jira/auto-discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days, maxIssues, projectKeys }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Auto-discover failed");
        const results: PendingComment[] = data.results || [];
        setPendingComments(results);
        setScanStats({ scanned: data.scanned || 0, found: results.length });
        return results;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Auto-discover failed";
        if (/failed to fetch/i.test(msg)) {
          setScanStats({ scanned: 0, found: 0 });
          return [];
        }
        setError(msg);
        throw e;
      } finally {
        setIsDiscovering(false);
      }
    },
    []
  );

  /**
   * Manual scan: scan a specific list of issue keys for sync hashtags.
   * No date filter — finds ALL unsynced comments with the hashtags.
   */
  const pollForSyncComments = useCallback(
    async (issueKeys: string[]): Promise<PendingComment[]> => {
      setIsPolling(true);
      setError(null);
      setScanStats(null);
      try {
        const res = await fetch(`${API_BASE}/api/jira/poll-sync-comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueKeys }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Poll failed");
        const results: PendingComment[] = data.results || [];
        // Merge: keep existing unsynced comments, add any newly discovered ones
        setPendingComments((prev) => {
          const existingKeys = new Set(prev.map((p) => `${p.issueKey}::${p.commentId}`));
          const newItems = results.filter((r) => !existingKeys.has(`${r.issueKey}::${r.commentId}`));
          return [...prev, ...newItems];
        });
        setScanStats({ scanned: data.scanned || 0, found: results.length });
        return results;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Poll failed";
        if (/failed to fetch/i.test(msg)) {
          setScanStats({ scanned: 0, found: 0 });
          return [];
        }
        setError(msg);
        throw e;
      } finally {
        setIsPolling(false);
      }
    },
    []
  );

  /** Fetch persisted sync history from the server */
  const fetchSyncHistory = useCallback(async (): Promise<SyncRecord[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/jira/sync-history`);
      const data = await safeJson(res);
      const history: SyncRecord[] = data.history || [];
      setSyncHistory(history);
      return history;
    } catch (e) {
      console.error("[useCommentSync] fetchSyncHistory error", e);
      return [];
    }
  }, []);

  /** Fetch the display name of the currently logged-in Jira user */
  const fetchCurrentUser = useCallback(async (): Promise<{ displayName: string; email: string } | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/jira/current-user`);
      if (!res.ok) return null;
      const data = await safeJson(res);
      if (!data.displayName) return null;
      return data as { displayName: string; email: string };
    } catch {
      return null;
    }
  }, []);

  return {
    isSyncing,
    isSyncingAll,
    isPolling,
    isDiscovering,
    syncHistory,
    pendingComments,
    scanStats,
    error,
    syncComment,
    syncAll,
    autoDiscover,
    pollForSyncComments,
    fetchSyncHistory,
    fetchCurrentUser,
  };
}
