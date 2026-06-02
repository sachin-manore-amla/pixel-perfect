import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  MessageSquare,
  Check,
  X,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Loader2,
  ScanSearch,
  ChevronDown,
  ChevronUp,
  Clock,
  AlertCircle,
} from "lucide-react";
import { useCommentSync, type PendingComment, type SyncRecord } from "@/hooks/useCommentSync";

const DIRECTION_LABEL: Record<string, string> = {
  "to-zlmc": "Z10 → ZLMC",
  "to-z10": "ZLMC → Z10",
};

const DIRECTION_TAG: Record<string, string> = {
  "to-zlmc": "#updateforzlmc",
  "to-z10": "#updateforz10",
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const CommentSyncPage = () => {
  const {
    isSyncingAll,
    isPolling,
    syncHistory,
    pendingComments,
    scanStats,
    error,
    syncComment,
    syncAll,
    pollForSyncComments,
    fetchSyncHistory,
  } = useCommentSync();

  const [issueKeysInput, setIssueKeysInput] = useState("");
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
  const [syncAllSummary, setSyncAllSummary] = useState<string | null>(null);

  useEffect(() => {
    fetchSyncHistory();
  }, [fetchSyncHistory]);

  const handleScan = async () => {
    const keys = issueKeysInput
      .split(/[\s,]+/)
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean);
    if (keys.length === 0) return;
    setSyncAllSummary(null);
    await pollForSyncComments(keys);
  };

  const handleSync = async (comment: PendingComment) => {
    const uid = `${comment.issueKey}-${comment.commentId}`;
    setSyncingId(uid);
    try {
      await syncComment(comment.issueKey, comment.commentBody, comment.commentId, comment.author);
      setSuccessIds((prev) => new Set(prev).add(uid));
    } catch {
      // error shown via hook state
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncAllSummary(null);
    try {
      const summary = await syncAll(pendingComments);
      setSyncAllSummary(
        `Done — ${summary.succeeded} synced, ${summary.skipped} skipped (already done), ${summary.failed} failed`
      );
    } catch {
      // error shown via hook state
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comment Sync</h1>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered bi-directional comment sync between{" "}
            <span className="font-semibold text-primary">Z10</span> and{" "}
            <span className="font-semibold text-primary">ZLMC</span> boards
          </p>
        </div>

        {/* How it works banner */}
        <div className="rounded border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> How it works
          </p>
          <p>
            Add <code className="bg-muted px-1 rounded font-mono text-primary">#updateforzlmc</code> in a Z10 comment to push an AI-refined,
            client-friendly version to the linked ZLMC ticket.
          </p>
          <p>
            Add <code className="bg-muted px-1 rounded font-mono text-primary">#updateforz10</code> in a ZLMC comment to push a full-detail
            version to the linked Z10 internal ticket.
          </p>
          <p>AI strips internal jargon for client-facing updates and preserves all technical details for internal ones.</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded bg-card border border-border border-l-4 border-l-success p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Synced</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {syncHistory.filter((r) => r.status === "success").length}
            </p>
          </div>
          <div className="rounded bg-card border border-border border-l-4 border-l-warning p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Pending Sync</p>
            <p className="text-2xl font-bold text-foreground mt-1">{pendingComments.length}</p>
          </div>
          <div className="rounded bg-card border border-border border-l-4 border-l-destructive p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Failed</p>
            <p className="text-2xl font-bold text-foreground mt-1">
              {syncHistory.filter((r) => r.status === "failed").length}
            </p>
          </div>
        </div>

        {/* Scan panel */}
        <div className="rounded bg-card border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-2">
            <ScanSearch className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
              Scan Tickets for Pending Syncs
            </span>
          </div>
          <div className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Enter one or more ticket keys (comma or space separated) to scan for comments containing{" "}
              <code className="bg-muted px-1 rounded font-mono">#updateforzlmc</code> or{" "}
              <code className="bg-muted px-1 rounded font-mono">#updateforz10</code>.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={issueKeysInput}
                onChange={(e) => setIssueKeysInput(e.target.value)}
                placeholder="e.g. Z10-34724, Z10-34725, Z10LMC-3339"
                className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={(e) => e.key === "Enter" && handleScan()}
              />
              <button
                onClick={handleScan}
                disabled={isPolling || !issueKeysInput.trim()}
                className="inline-flex items-center gap-2 rounded border border-border bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPolling ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {isPolling ? "Scanning…" : "Scan"}
              </button>
            </div>
            {scanStats && !isPolling && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-success" />
                Scanned <span className="font-semibold text-foreground">{scanStats.scanned}</span> tickets —{" "}
                <span className="font-semibold text-foreground">{scanStats.found}</span> pending comment{scanStats.found !== 1 ? "s" : ""} found
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Pending comments — shown after any scan */}
        {scanStats !== null && pendingComments.length === 0 && !isPolling && (
          <div className="rounded bg-card border border-border px-4 py-6 text-center text-xs text-muted-foreground">
            No pending comments found. Make sure the ticket has a comment containing{" "}
            <code className="bg-muted px-1 rounded font-mono text-primary">#updateforzlmc</code> or{" "}
            <code className="bg-muted px-1 rounded font-mono text-primary">#updateforz10</code>.
          </div>
        )}

        {pendingComments.length > 0 && (
          <div className="rounded bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-warning" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Pending Synchronization ({pendingComments.length})
                </span>
              </div>
              <button
                onClick={handleSyncAll}
                disabled={isSyncingAll}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {isSyncingAll ? "Syncing All…" : `Sync All (${pendingComments.length})`}
              </button>
            </div>

            {syncAllSummary && (
              <div className="px-4 py-2 bg-success/10 border-b border-border text-xs text-success flex items-center gap-2">
                <Check className="h-3.5 w-3.5 shrink-0" /> {syncAllSummary}
              </div>
            )}

            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Ticket</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Author</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Added</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Movement</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Identifier</th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Comment Preview</th>
                  <th className="text-center py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingComments.map((comment) => {
                  const uid = `${comment.issueKey}-${comment.commentId}`;
                  const isSyncingThis = syncingId === uid;
                  const isDone = successIds.has(uid);
                  const isExpanded = expandedCommentId === uid;

                  return (
                    <>
                      <tr
                        key={uid}
                        className="border-b border-border hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono font-semibold text-primary">{comment.issueKey}</td>
                        <td className="py-3 px-4 text-foreground">{comment.author}</td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatRelative(comment.created)}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <ArrowRight className="h-3 w-3" />
                            {DIRECTION_LABEL[comment.direction]}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-primary">
                            {DIRECTION_TAG[comment.direction]}
                          </code>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground max-w-[220px] truncate">
                          <button
                            onClick={() => setExpandedCommentId(isExpanded ? null : uid)}
                            className="flex items-center gap-1 hover:text-foreground text-left"
                            title={isExpanded ? "Collapse" : "Preview comment"}
                          >
                            <span className="truncate max-w-[180px]">{comment.commentBody}</span>
                            {isExpanded ? <ChevronUp className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                          </button>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleSync(comment)}
                            disabled={isSyncingThis || isDone}
                            className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSyncingThis ? (
                              <><Loader2 className="h-3 w-3 animate-spin" /> Syncing…</>
                            ) : isDone ? (
                              <><Check className="h-3 w-3 text-success" /> Synced</>
                            ) : (
                              <><Sparkles className="h-3 w-3 text-primary" /> Sync Now</>
                            )}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${uid}-expanded`} className="border-b border-border bg-muted/20">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="rounded border border-border bg-muted/40 px-3 py-2 text-xs text-foreground whitespace-pre-wrap font-mono leading-relaxed">
                              {comment.commentBody}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Sync history */}
        <div className="rounded bg-card border border-border overflow-hidden">
          <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                Sync History
              </span>
            </div>
            <button
              onClick={fetchSyncHistory}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </button>
          </div>
          {syncHistory.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              No sync records yet. Scan tickets and use "Sync Now" to start.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">
                    Source
                  </th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">
                    Direction
                  </th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">
                    Target
                  </th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">
                    Author
                  </th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">
                    AI Output (preview)
                  </th>
                  <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">
                    Time
                  </th>
                  <th className="text-center py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {syncHistory.map((record: SyncRecord) => (
                  <tr
                    key={record.id}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-primary">{record.sourceKey}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <ArrowRight className="h-3 w-3" />
                        {DIRECTION_LABEL[record.direction]}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-primary">{record.targetKey}</td>
                    <td className="py-3 px-4 text-muted-foreground">{record.author}</td>
                    <td className="py-3 px-4 text-muted-foreground max-w-[280px] truncate">
                      {record.transformedComment}
                    </td>
                    <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                      {formatRelative(record.timestamp)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {record.status === "success" ? (
                        <span className="inline-flex items-center gap-1 text-success">
                          <Check className="h-3 w-3" /> Synced
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 text-destructive"
                          title={record.error}
                        >
                          <X className="h-3 w-3" /> Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CommentSyncPage;
