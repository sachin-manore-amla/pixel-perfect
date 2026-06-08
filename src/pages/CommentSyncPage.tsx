import { useState, useEffect, useRef, useCallback } from "react";
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
  Radio,
  ChevronRight,
  Paperclip,
  Link,
} from "lucide-react";
import { useCommentSync, type PendingComment, type SyncRecord } from "@/hooks/useCommentSync";
import { useSelectedProjects } from "@/hooks/useSelectedProjects";
import { useJiraConfig } from "@/hooks/use-jira-config";

const DIRECTION_LABEL: Record<string, string> = {
  "to-zlmc": "Z10 → ZLMC",
  "to-z10": "ZLMC → Z10",
};

const DIRECTION_TAG: Record<string, string> = {
  "to-zlmc": "#updateforzlmc",
  "to-z10": "#updateforz10",
};

/** How often to auto-discover (ms) */
const AUTO_POLL_INTERVAL = 30_000;

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

const CommentSyncPage = () => {
  const {
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
  } = useCommentSync();

  const [issueKeysInput, setIssueKeysInput] = useState("");
  const [expandedCommentId, setExpandedCommentId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [successIds, setSuccessIds] = useState<Set<string>>(new Set());
  const [syncAllSummary, setSyncAllSummary] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [showManualScan, setShowManualScan] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_POLL_INTERVAL / 1000);
  const [historyPage, setHistoryPage] = useState(1);
  const HISTORY_PAGE_SIZE = 10;
  const nextPollRef = useRef<number>(Date.now() + AUTO_POLL_INTERVAL);
  const isFirstRunRef = useRef(true);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [mentionFilterEnabled, setMentionFilterEnabled] = useState(true);

  const runAutoDiscover = useCallback(async () => {
    try {
      // First run: scan last 7 days to catch anything pending.
      // Subsequent polls: 1-day window — server's lastSyncedAt handles precision dedup.
      const days = isFirstRunRef.current ? 7 : 1;
      isFirstRunRef.current = false;
      await autoDiscover(days, 200);
      setLastChecked(new Date());
      nextPollRef.current = Date.now() + AUTO_POLL_INTERVAL;
      setCountdown(AUTO_POLL_INTERVAL / 1000);
    } catch {
      // error shown via hook
    }
  }, [autoDiscover]);

  // Initial load
  useEffect(() => {
    fetchSyncHistory();
    runAutoDiscover();
    fetchCurrentUser().then((u) => { if (u) setCurrentUserName(u.displayName); });
  }, [fetchSyncHistory, runAutoDiscover, fetchCurrentUser]);

  // Auto-poll interval
  useEffect(() => {
    if (!liveEnabled) return;
    const id = setInterval(runAutoDiscover, AUTO_POLL_INTERVAL);
    return () => clearInterval(id);
  }, [liveEnabled, runAutoDiscover]);

  // Countdown tick
  useEffect(() => {
    if (!liveEnabled) return;
    const id = setInterval(() => {
      const secs = Math.max(0, Math.round((nextPollRef.current - Date.now()) / 1000));
      setCountdown(secs);
    }, 1000);
    return () => clearInterval(id);
  }, [liveEnabled]);

  const handleScan = async () => {
    const keys = issueKeysInput
      .split(/[\s,]+/)
      .map((k) => k.trim().toUpperCase())
      .filter(Boolean);
    if (keys.length === 0) return;
    setSyncAllSummary(null);
    await pollForSyncComments(keys);
    setLastChecked(new Date());
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
      const summary = await syncAll(visibleComments);
      setSyncAllSummary(
        `Done — ${summary.succeeded} synced, ${summary.skipped} skipped (already done), ${summary.failed} failed`
      );
    } catch {
      // error shown via hook state
    }
  };

  const isLoading = isDiscovering || isPolling;

  /**
   * Render comment text with @mentions highlighted as blue pills.
   * Splits on whitespace-separated tokens that look like @Word+ (Jira inlines them
   * as plain text after ADF extraction).
   */
  function renderWithMentions(text: string, mentions: string[]) {
    if (!mentions.length) return <>{text}</>;
    // Build a regex that matches any of the known mention names
    const escaped = mentions.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = new RegExp(`(@(?:${escaped.join("|")})\\b)`, "gi");
    const parts = text.split(pattern);
    return (
      <>
        {parts.map((part, i) =>
          pattern.test(part) ? (
            <span key={i} className="inline-flex items-center rounded-full bg-primary/15 text-primary px-1.5 py-0 font-semibold">
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </>
    );
  }
  // Filter pending comments: if mention filter is on, show only comments that
  // mention the currently logged-in user (or untagged comments if no user resolved yet).
  const visibleComments = mentionFilterEnabled && currentUserName
    ? pendingComments.filter(
        (c) => c.mentions.some((m) => m.toLowerCase() === currentUserName.toLowerCase())
      )
    : pendingComments;

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Comment Sync</h1>
            <p className="text-sm text-muted-foreground mt-1">
              AI-powered bi-directional comment sync between{" "}
              <span className="font-semibold text-primary">Z10</span> and{" "}
              <span className="font-semibold text-primary">ZLMC</span> boards
            </p>
          </div>
          {/* Live monitor badge */}
          <div className="flex items-center gap-2 rounded border border-border bg-card px-3 py-2 text-xs shrink-0">
            <button
              onClick={() => setLiveEnabled((v) => !v)}
              className={`flex items-center gap-1.5 font-semibold transition-colors ${
                liveEnabled ? "text-success" : "text-muted-foreground"
              }`}
              title={liveEnabled ? "Click to pause live monitoring" : "Click to enable live monitoring"}
            >
              <Radio className={`h-3.5 w-3.5 ${liveEnabled ? "animate-pulse" : ""}`} />
              {liveEnabled ? "Live" : "Paused"}
            </button>
            {liveEnabled && (
              <span className="text-muted-foreground">· next scan in {countdown}s</span>
            )}
            {lastChecked && (
              <span className="text-muted-foreground border-l border-border pl-2 ml-1">
                Last checked {formatTime(lastChecked)}
              </span>
            )}
            <button
              onClick={runAutoDiscover}
              disabled={isLoading}
              title="Refresh now"
              className="ml-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
            >
              {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* How it works banner */}
        <div className="rounded border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> How it works
          </p>
          <p>
            Add <code className="bg-muted px-1 rounded font-mono text-primary">#updateforzlmc</code> in a Z10 comment → AI rewrites it client-friendly → auto-appears here for sync to the linked ZLMC ticket.
          </p>
          <p>
            Add <code className="bg-muted px-1 rounded font-mono text-primary">#updateforz10</code> in a ZLMC comment → AI preserves full detail → auto-appears here for sync to the linked Z10 ticket.
          </p>
          <p className="text-muted-foreground/70">Both boards are scanned automatically every {AUTO_POLL_INTERVAL / 1000}s. You can also scan specific tickets manually below.</p>
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

        {/* Manual scan — collapsible */}
        <div className="rounded bg-card border border-border overflow-hidden">
          <button
            onClick={() => setShowManualScan((v) => !v)}
            className="w-full px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between text-left hover:bg-muted/70 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ScanSearch className="h-4 w-4 text-primary" />
              <span className="text-xs font-semibold text-foreground uppercase tracking-wide">Scan Specific Tickets</span>
              <span className="text-xs text-muted-foreground">(optional — auto-scan covers both boards)</span>
            </div>
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${showManualScan ? "rotate-90" : ""}`} />
          </button>
          {showManualScan && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter specific ticket keys to scan immediately, in addition to the auto-scan.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={issueKeysInput}
                  onChange={(e) => setIssueKeysInput(e.target.value)}
                  placeholder="e.g. Z10-34724, Z10LMC-3339"
                  className="flex-1 rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => e.key === "Enter" && handleScan()}
                />
                <button
                  onClick={handleScan}
                  disabled={isPolling || !issueKeysInput.trim()}
                  className="inline-flex items-center gap-2 rounded border border-border bg-primary text-primary-foreground px-4 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPolling ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
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
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Loading state */}
        {isLoading && pendingComments.length === 0 && (
          <div className="rounded bg-card border border-border px-4 py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Scanning both boards for pending comments…
          </div>
        )}

        {/* Empty state after load */}
        {!isLoading && visibleComments.length === 0 && lastChecked && (
          <div className="rounded bg-card border border-border px-4 py-6 text-center text-xs text-muted-foreground">
            {pendingComments.length > 0 && mentionFilterEnabled
              ? `✓ No comments mention you (${pendingComments.length} pending for others). `
              : `✓ No pending comments. Boards are up to date as of ${formatTime(lastChecked)}.`}
            {pendingComments.length > 0 && mentionFilterEnabled && (
              <button
                onClick={() => setMentionFilterEnabled(false)}
                className="underline text-primary hover:opacity-80"
              >
                Show all {pendingComments.length}
              </button>
            )}
          </div>
        )}

        {/* Mention filter toggle — always visible once user is resolved */}
        {currentUserName && (pendingComments.length > 0 || visibleComments.length > 0) && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Filter:</span>
            <button
              onClick={() => setMentionFilterEnabled((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                mentionFilterEnabled
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-muted text-muted-foreground"
              }`}
              title={mentionFilterEnabled ? "Showing only comments mentioning you — click to show all" : "Click to show only comments mentioning you"}
            >
              @{currentUserName.split(" ")[0]} only
              {mentionFilterEnabled ? " ✓" : ""}
            </button>
            {mentionFilterEnabled && pendingComments.length > visibleComments.length && (
              <span className="text-xs text-muted-foreground">
                ({pendingComments.length - visibleComments.length} others hidden)
              </span>
            )}
          </div>
        )}

        {visibleComments.length > 0 && (
          <div className="rounded bg-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-warning" />
                <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  Pending Synchronization ({visibleComments.length})
                </span>
              </div>
              <button
                onClick={handleSyncAll}
                disabled={isSyncingAll}
                className="inline-flex items-center gap-1.5 rounded border border-border bg-primary text-primary-foreground px-3 py-1.5 text-xs font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSyncingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                {isSyncingAll ? "Syncing All…" : `Sync All (${visibleComments.length})`}
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
                {visibleComments.map((comment) => {
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
                            <span className="truncate max-w-[180px] flex items-center gap-0.5 flex-wrap">
                              {renderWithMentions(comment.commentBody.slice(0, 120), comment.mentions)}
                            </span>
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
                          <td colSpan={7} className="px-4 py-3 space-y-2">
                            {/* Comment body — full ADF formatting preserved */}
                            <div
                              className="adf-body rounded border border-border bg-muted/40 px-3 py-2 text-xs text-foreground leading-relaxed"
                              dangerouslySetInnerHTML={{ __html: comment.commentBodyHtml || comment.commentBody }}
                            />

                            {/* Attachments */}
                            {comment.attachmentCount > 0 && (
                              <div className="flex items-center gap-1 flex-wrap">
                                <Paperclip className="h-3 w-3 text-muted-foreground/70 shrink-0" />
                                {comment.attachments.map(({ name, url }, i) =>
                                  url ? (
                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                                      className="inline-flex items-center rounded bg-muted px-1.5 py-0 text-[10px] text-primary font-mono hover:underline">
                                      {name}
                                    </a>
                                  ) : (
                                    <span key={i} className="inline-flex items-center rounded bg-muted px-1.5 py-0 text-[10px] text-muted-foreground font-mono">{name}</span>
                                  )
                                )}
                              </div>
                            )}

                            {/* External links */}
                            {comment.externalLinkCount > 0 && (
                              <div className="flex items-start gap-1 flex-wrap">
                                <Link className="h-3 w-3 text-muted-foreground/70 shrink-0 mt-0.5" />
                                {comment.externalLinks.map((url) => (
                                  <a key={url} href={url} target="_blank" rel="noopener noreferrer"
                                    className="inline-flex items-center rounded bg-muted px-1.5 py-0 text-[10px] text-primary font-mono hover:underline max-w-[280px] truncate">
                                    {url}
                                  </a>
                                ))}
                              </div>
                            )}
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
          ) : (() => {
            const sorted = [...syncHistory].sort(
              (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            );
            const totalPages = Math.ceil(sorted.length / HISTORY_PAGE_SIZE);
            const pageRecords = sorted.slice(
              (historyPage - 1) * HISTORY_PAGE_SIZE,
              historyPage * HISTORY_PAGE_SIZE
            );
            return (
              <>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                      <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Direction</th>
                      <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Target</th>
                      <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Author</th>
                      <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">AI Output (preview)</th>
                      <th className="text-left py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Time</th>
                      <th className="text-center py-2 px-4 font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRecords.map((record: SyncRecord) => (
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
                        <td className="py-3 px-4 text-muted-foreground max-w-[280px] truncate">{record.transformedComment}</td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{formatRelative(record.timestamp)}</td>
                        <td className="py-3 px-4 text-center">
                          {record.status === "success" ? (
                            <span className="inline-flex items-center gap-1 text-success"><Check className="h-3 w-3" /> Synced</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-destructive" title={record.error}><X className="h-3 w-3" /> Failed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-muted/30">
                    <span className="text-xs text-muted-foreground">
                      Showing {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}–{Math.min(historyPage * HISTORY_PAGE_SIZE, sorted.length)} of {sorted.length}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setHistoryPage(1)}
                        disabled={historyPage === 1}
                        className="px-2 py-1 rounded border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >«</button>
                      <button
                        onClick={() => setHistoryPage((p) => p - 1)}
                        disabled={historyPage === 1}
                        className="px-2 py-1 rounded border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >‹</button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((p) => p === 1 || p === totalPages || Math.abs(p - historyPage) <= 1)
                        .reduce<(number | "...")[]>((acc, p, idx, arr) => {
                          if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                          acc.push(p);
                          return acc;
                        }, [])
                        .map((p, i) =>
                          p === "..." ? (
                            <span key={`ellipsis-${i}`} className="px-2 py-1 text-xs text-muted-foreground">…</span>
                          ) : (
                            <button
                              key={p}
                              onClick={() => setHistoryPage(p as number)}
                              className={`px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                                historyPage === p
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border text-muted-foreground hover:bg-muted"
                              }`}
                            >{p}</button>
                          )
                        )}
                      <button
                        onClick={() => setHistoryPage((p) => p + 1)}
                        disabled={historyPage === totalPages}
                        className="px-2 py-1 rounded border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >›</button>
                      <button
                        onClick={() => setHistoryPage(totalPages)}
                        disabled={historyPage === totalPages}
                        className="px-2 py-1 rounded border border-border text-xs text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >»</button>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CommentSyncPage;
