import { useState, useCallback } from "react";

const API_BASE = "http://localhost:3001";

export interface SyncRecord {
  id: string;
  sourceKey: string;
  targetKey: string;
  direction: "to-zlmc" | "to-z10";
  commentId: string;
  originalComment: string;
  transformedComment: string;
  author: string;
  timestamp: string;
  status: "success" | "failed";
  error?: string;
}

export interface PendingComment {
  issueKey: string;
  commentId: string;
  commentBody: string;
  author: string;
  created: string;
  direction: "to-zlmc" | "to-z10";
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
      author = "Unknown"
    ): Promise<SyncRecord> => {
      setIsSyncing(true);
      setError(null);
      try {
        const res = await fetch(`${API_BASE}/api/jira/sync-comment`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ issueKey, commentBody, commentId, author }),
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
    async (comments: PendingComment[]): Promise<SyncAllSummary> => {
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
   * Auto-discover: JQL-scans both Z10 and Z10LMC projects for sync hashtags.
   * No manual ticket entry needed.
   */
  const autoDiscover = useCallback(
    async (days = 7, maxIssues = 50): Promise<PendingComment[]> => {
      setIsDiscovering(true);
      setError(null);
      setScanStats(null);
      try {
        const res = await fetch(`${API_BASE}/api/jira/auto-discover`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ days, maxIssues }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Auto-discover failed");
        const results: PendingComment[] = data.results || [];
        setPendingComments(results);
        setScanStats({ scanned: data.scanned || 0, found: results.length });
        return results;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Auto-discover failed";
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
        setPendingComments(results);
        setScanStats({ scanned: data.scanned || 0, found: results.length });
        return results;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Poll failed";
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
      const data = await res.json();
      const history: SyncRecord[] = data.history || [];
      setSyncHistory(history);
      return history;
    } catch (e) {
      console.error("[useCommentSync] fetchSyncHistory error", e);
      return [];
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
  };
}

export interface SyncRecord {
  id: string;
  sourceKey: string;
  targetKey: string;
  direction: "to-zlmc" | "to-z10";
  originalComment: string;
  transformedComment: string;
  author: string;
  timestamp: string;
  status: "success" | "failed";
  error?: string;
}

export interface PendingComment {
  issueKey: string;
  commentId: string;
  commentBody: string;
  author: string;
  created: string;
  direction: "to-zlmc" | "to-z10";
}
