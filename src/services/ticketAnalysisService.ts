const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface JiraComment {
  id: string;
  author: { displayName: string };
  created: string;
  updated: string;
  body: string | { type: string; version: number; content?: any };
}

export interface JiraTicket {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    priority?: { name: string };
    assignee?: { displayName: string; accountId?: string } | null;
    created: string;
    updated: string;
    comment?: {
      comments: JiraComment[];
    };
  };
}

export interface AttentionRequired {
  ticketKey: string;
  ticketSummary: string;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  updated: string;
  status: string;
  comments: JiraComment[];
  commentCount: number;
}

// Fetch P1 tickets that need attention
// daysWindow: number of days to look back (default: 30)
export async function fetchP1TicketsWithComments(daysWindow: number = 30, selectedProjects: string[] = [], currentUser?: CurrentUser): Promise<{
  tickets: JiraTicket[];
  attentionRequired: AttentionRequired[];
  attentionCount: number;
}> {
  try {
    console.log(`[Tickets Service] Step 1: Fetching P1 tickets from last ${daysWindow} days...`);

    // Build project filter from selected projects
    if (selectedProjects.length === 0) {
      console.warn("[Tickets Service] No projects selected, returning empty results.");
      return { tickets: [], attentionRequired: [], attentionCount: 0 };
    }
    const projectFilter = selectedProjects.length === 1
      ? `project = ${selectedProjects[0]}`
      : `project IN (${selectedProjects.join(", ")})`;

    // Step 1: Fetch P1 tickets with broader status filtering (original curl approach)
    const jql =
      `${projectFilter} AND customfield_10092 ~ "Priority 1" AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected)`;

    const ticketsResponse = await fetch(`${API_BASE}/api/jira/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql,
        maxResults: 100,
        fields: ["summary", "status", "priority", "assignee", "created", "updated"],
      }),
    });

    if (!ticketsResponse.ok) {
      const error = await ticketsResponse.text();
      throw new Error(`Failed to fetch tickets: ${ticketsResponse.statusText} - ${error}`);
    }

    const ticketsData = await ticketsResponse.json();
    const tickets: JiraTicket[] = ticketsData.issues || [];
    console.log(`[Tickets Service] Found ${tickets.length} P1 tickets total (all active statuses)`);

    if (tickets.length === 0) {
      return {
        tickets: [],
        attentionRequired: [],
        attentionCount: 0,
      };
    }

    // Step 2: Fetch comments for each ticket using the /issue/{key}/comment endpoint
    console.log("[Tickets Service] Step 2: Fetching comments for each ticket...");
    const ticketsWithComments = new Map<
      string,
      { ticket: JiraTicket; comments: JiraComment[] }
    >();

    for (const ticket of tickets) {
      try {
        const commentResponse = await fetch(
          `${API_BASE}/api/jira/api/issue/${ticket.key}/comment`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (commentResponse.ok) {
          const commentData = await commentResponse.json();
          const comments = commentData.comments || [];
          console.log(`[Tickets Service] Ticket ${ticket.key}: ${comments.length} comments found`);
          ticketsWithComments.set(ticket.key, {
            ticket,
            comments,
          });
        } else {
          console.log(`[Tickets Service] Ticket ${ticket.key}: No comments or error fetching`);
          ticketsWithComments.set(ticket.key, {
            ticket,
            comments: [],
          });
        }
      } catch (error) {
        console.warn(`[Tickets Service] Error fetching comments for ${ticket.key}:`, error);
        ticketsWithComments.set(ticket.key, {
          ticket,
          comments: [],
        });
      }
    }

    console.log(`[Tickets Service] Total tickets with comments: ${ticketsWithComments.size}`);

    // Step 3: Analyze comments to identify attention-required tickets
    console.log(`[Tickets Service] Step 3: Analyzing comments for attention (mentions + unanswered questions)...`);
    const attentionRequired: AttentionRequired[] = [];
    const addedKeys = new Set<string>();
    const now = new Date();
    const windowMs = daysWindow * 24 * 60 * 60 * 1000;
    const windowStart = new Date(now.getTime() - windowMs);

    for (const [, ticketData] of ticketsWithComments.entries()) {
      const { ticket, comments } = ticketData;

      if (comments.length === 0) {
        console.log(`[Tickets Service] Skipping ${ticket.key}: No comments`);
        continue;
      }

      // Check if ticket has recent activity within the time window
      const hasRecentComments = comments.some((c) => new Date(c.updated) >= windowStart);
      const ticketUpdatedDate = new Date(ticket.fields.updated);
      const ticketIsRecent = ticketUpdatedDate >= windowStart;

      if (!hasRecentComments && !ticketIsRecent) {
        console.log(
          `[Tickets Service] Skipping ${ticket.key}: No activity in last ${daysWindow} days`
        );
        continue;
      }

      // --- STEP A: Check if currentUser is mentioned in last 2-3 comments (AND condition) ---
      let isMentionedRecently = false;
      if (currentUser) {
        const lastFewComments = comments.slice(-3);
        isMentionedRecently = lastFewComments.some((c) => {
          // ADF accountId check
          if (typeof c.body === "object" && c.body !== null) {
            const bodyStr = JSON.stringify(c.body);
            if (
              bodyStr.includes(`"id":"${currentUser.accountId}"`) ||
              bodyStr.includes(`"accountId":"${currentUser.accountId}"`)
            ) return true;
          }
          // Plain text / extracted text check
          const text = extractCommentText(c.body).toLowerCase();
          return text.includes(`@${currentUser.displayName.toLowerCase()}`);
        });
        if (!isMentionedRecently) {
          console.log(`[Tickets Service] ${ticket.key}: currentUser not mentioned in last 3 comments — skipping`);
          continue; // Must be mentioned — short-circuit
        }
        console.log(`[Tickets Service] ${ticket.key}: ✅ @${currentUser.displayName} mentioned in last 3 comments`);
      }

      // --- STEP B: AI / keyword analysis — question or blocker must also be present ---
      const latestComment = comments[comments.length - 1];
      if (latestComment) {
        const bodyText = typeof latestComment.body === "string"
          ? latestComment.body
          : JSON.stringify(latestComment.body).substring(0, 50);
        console.log(
          `[Tickets Service] ${ticket.key} - Latest comment by ${latestComment.author?.displayName}: "${bodyText}..."`
        );
      }

      const commentsForAI = comments.map((c) => ({
        author: c.author?.displayName || "Unknown",
        text: extractCommentText(c.body).substring(0, 300),
      }));

      let analysis: AnalysisResult;
      try {
        const aiResponse = await fetch(`${API_BASE}/api/ai/analyze-comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ticketKey: ticket.key,
            ticketSummary: ticket.fields.summary,
            comments: commentsForAI,
            mentionedUser: currentUser?.displayName,
          }),
        });

        if (aiResponse.ok) {
          const aiResult = await aiResponse.json();
          analysis = {
            needsAttention: aiResult.needsAttention === true,
            reason: aiResult.reason || "",
            priority: aiResult.priority || "LOW",
          };
          console.log(`[AI] ${ticket.key}: ${analysis.needsAttention ? "⚠️ Needs Attention" : "✅ OK"} — ${analysis.reason}`);
        } else {
          console.log(`[AI] ${ticket.key}: OpenAI unavailable, using keyword fallback`);
          analysis = analyzeCommentsForUnanswered(comments);
        }
      } catch {
        console.log(`[AI] ${ticket.key}: OpenAI call failed, using keyword fallback`);
        analysis = analyzeCommentsForUnanswered(comments);
      }

      console.log(
        `[Tickets Service] ${ticket.key} - Mention: ${isMentionedRecently}, AI needsAttention: ${analysis.needsAttention}, Reason: ${analysis.reason}`
      );

      // --- FINAL: Both conditions must be true (AND logic) ---
      // If no currentUser configured, fall back to AI-only check
      const shouldAdd = currentUser
        ? isMentionedRecently && analysis.needsAttention
        : analysis.needsAttention;

      if (shouldAdd && !addedKeys.has(ticket.key)) {
        const mentionNote = currentUser ? ` + @${currentUser.displayName} tagged` : "";
        attentionRequired.push({
          ticketKey: ticket.key,
          ticketSummary: ticket.fields.summary,
          reason: `${analysis.reason}${mentionNote}`,
          priority: analysis.priority,
          updated: ticket.fields.updated,
          status: ticket.fields.status.name,
          comments,
          commentCount: comments.length,
        });
        addedKeys.add(ticket.key);
      }
    }

    console.log(`[Tickets Service] Found ${attentionRequired.length} tickets needing attention`);
    return {
      tickets,
      attentionRequired,
      attentionCount: attentionRequired.length,
    };
  } catch (error) {
    console.error("[Tickets Service] Error:", error);
    throw error;
  }
}

// Analyze comments to detect unanswered questions or issues
interface AnalysisResult {
  needsAttention: boolean;
  reason: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

// Helper to extract text from comment body (handles both string and ADF formats)
function extractCommentText(body: string | { type: string; version: number; content?: any }): string {
  if (typeof body === "string") {
    return body;
  }
  // For ADF (Atlassian Document Format), extract text from all node types
  if (typeof body === "object" && body.content) {
    try {
      const texts: string[] = [];
      const extractFromContent = (items: any[]) => {
        if (!Array.isArray(items)) return;
        for (const item of items) {
          if (typeof item === "object") {
            // Regular text node
            if (item.text) texts.push(item.text);
            // Mention node — attrs.text holds "@DisplayName"
            if (item.type === "mention" && item.attrs?.text) texts.push(item.attrs.text);
            // Emoji node — attrs.text holds the emoji shortname
            if (item.attrs?.text && item.type !== "mention") texts.push(item.attrs.text);
            // Recurse into content
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

function analyzeCommentsForUnanswered(comments: JiraComment[]): AnalysisResult {
  // Only analyze last 3 comments — same window as mention check
  const recentComments = comments.slice(-3);

  const keywordPatterns = {
    // Actual question mark
    questions: ["?"],
    // Specific blocker words
    blockers: ["blocking", "blocked", "blocker", "stuck", "cannot proceed", "can't proceed", "production down", "outage"],
    // Specific urgency
    urgent: ["urgent", "asap", "escalate", "escalation", "critical", "sev1"],
    // Explicit unresolved markers
    unresolved: ["unresolved", "no response", "no update", "waiting for", "pending approval"],
    // Actionable info requests — someone asking for input/action
    actionRequest: ["please", "can you", "could you", "would you", "please share", "please provide", "let us know", "need your", "waiting on you", "your input", "your thoughts", "please check", "please confirm", "please review", "please help"],
  };

  let questionCount = 0;
  let blockerCount = 0;
  let urgentCount = 0;
  let unresolvedCount = 0;
  let actionRequestCount = 0;

  for (const comment of recentComments) {
    const text = extractCommentText(comment.body).toLowerCase();
    if (keywordPatterns.questions.some((kw) => text.includes(kw))) questionCount++;
    if (keywordPatterns.blockers.some((kw) => text.includes(kw))) blockerCount++;
    if (keywordPatterns.urgent.some((kw) => text.includes(kw))) urgentCount++;
    if (keywordPatterns.unresolved.some((kw) => text.includes(kw))) unresolvedCount++;
    if (keywordPatterns.actionRequest.some((kw) => text.includes(kw))) actionRequestCount++;
  }

  // Needs attention if any actionable signal found
  const needsAttention = questionCount > 0 || blockerCount > 0 || unresolvedCount > 0 || actionRequestCount > 0;

  if (!needsAttention) {
    return { needsAttention: false, reason: "", priority: "LOW" };
  }

  let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  let reason = "";

  if (blockerCount > 0 && urgentCount > 0) {
    priority = "HIGH";
    reason = `Blocking issue with urgency (${blockerCount} blockers, ${urgentCount} urgent mentions)`;
  } else if (blockerCount > 0) {
    priority = "HIGH";
    reason = `Ticket has blocking issues (${blockerCount} mentions)`;
  } else if (unresolvedCount > 0 && questionCount > 0) {
    priority = "MEDIUM";
    reason = `Unanswered questions with no response (${questionCount} questions, ${unresolvedCount} unresolved markers)`;
  } else if (urgentCount > 0) {
    priority = "MEDIUM";
    reason = `Urgent response needed (${urgentCount} urgent mentions)`;
  } else if (actionRequestCount > 0) {
    priority = "MEDIUM";
    reason = `Action or information requested from you in recent comments`;
  } else if (questionCount > 0) {
    priority = "MEDIUM";
    reason = `Unanswered questions in comments (${questionCount} questions)`;
  } else if (unresolvedCount > 0) {
    priority = "LOW";
    reason = `Unresolved items pending (${unresolvedCount} mentions)`;
  }

  return { needsAttention, reason, priority };
}

export interface NewActivity {
  ticketKey: string;
  summary: string;
  lastComment: {
    author: string;
    text: string;
  };
  assignee: string;
  commentedAt: string;
}

// Fetch recent P1 tickets with new activity
export async function fetchRecentActivity(daysWindow: number = 1, currentUserDisplayName?: string, selectedProjects: string[] = []): Promise<NewActivity[]> {
  try {
    console.log(`[Tickets Service] Fetching recent activity from last ${daysWindow} days...`);

    // Build project filter from selected projects
    if (selectedProjects.length === 0) {
      console.warn("[Tickets Service] No projects selected, returning empty results.");
      return [];
    }
    const projectFilter = selectedProjects.length === 1
      ? `project = ${selectedProjects[0]}`
      : `project IN (${selectedProjects.join(", ")})`;

    // Fetch P1 tickets from selected projects using pagination
    const jql =
      `${projectFilter} AND customfield_10092 ~ "Priority 1" AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) ORDER BY updated DESC`;

    const PAGE_SIZE = 100;
    let startAt = 0;
    let allTickets: JiraTicket[] = [];
    let total = Infinity;

    // Paginate through all results
    while (startAt < total) {
      const ticketsResponse = await fetch(`${API_BASE}/api/jira/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jql,
          maxResults: PAGE_SIZE,
          startAt,
          fields: ["summary", "assignee", "created", "updated"],
        }),
      });

      if (!ticketsResponse.ok) {
        throw new Error(`Failed to fetch recent activity: ${ticketsResponse.statusText}`);
      }

      const ticketsData = await ticketsResponse.json();
      const pageTickets: JiraTicket[] = ticketsData.issues || [];
      total = ticketsData.total ?? pageTickets.length;
      allTickets = allTickets.concat(pageTickets);
      startAt += pageTickets.length;

      console.log(`[Tickets Service] Fetched ${allTickets.length} / ${total} tickets...`);

      if (pageTickets.length < PAGE_SIZE) break; // last page
    }

    const tickets = allTickets;
    console.log(`[Tickets Service] Total tickets fetched: ${tickets.length}`);

    // Fetch comments for each ticket
    const recentActivity: NewActivity[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysWindow);

    for (const ticket of tickets) {
      try {
        const commentResponse = await fetch(
          `${API_BASE}/api/jira/api/issue/${ticket.key}/comment`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (commentResponse.ok) {
          const commentData = await commentResponse.json();
          const comments: JiraComment[] = commentData.comments || [];

          if (comments.length === 0) continue;

          // If currentUserEmail is provided, find MY last comment index
          // then show only comments that came AFTER my last comment
          let relevantComments = comments;

          if (currentUserDisplayName) {
            // Find the last comment made by current user — exact displayName match (case+trim insensitive)
            let myLastCommentIndex = -1;
            for (let i = comments.length - 1; i >= 0; i--) {
              const authorName = comments[i].author?.displayName?.trim() || "";
              if (authorName.toLowerCase() === currentUserDisplayName.trim().toLowerCase()) {
                myLastCommentIndex = i;
                break;
              }
            }

            if (myLastCommentIndex === -1) {
              // Current user has never commented on this ticket — skip
              // (this section is only for tickets where YOU have been involved)
              console.log(`[RecentActivity] ${ticket.key}: No comment by "${currentUserDisplayName}" — skipping`);
              continue;
            }

            console.log(`[RecentActivity] ${ticket.key}: Found "${currentUserDisplayName}" at index ${myLastCommentIndex} of ${comments.length}`);

            // Comments after my last comment
            relevantComments = comments.slice(myLastCommentIndex + 1);

            if (relevantComments.length === 0) {
              console.log(`[RecentActivity] ${ticket.key}: No new comments after user's last comment — skipping`);
              continue;
            }

            // Only show if there are 1-3 new comments after user's last comment
            // If 4+ comments have piled up without user's response, remove from list
            if (relevantComments.length > 3) {
              console.log(`[RecentActivity] ${ticket.key}: ${relevantComments.length} comments after user's last — too many (>3), skipping`);
              continue;
            }

            console.log(`[RecentActivity] ${ticket.key}: ${relevantComments.length} new comment(s) after user's last comment ✅`);
          } else {
            // No user context — fallback: show tickets with recent comments in last daysWindow
            const latestComment = comments[comments.length - 1];
            const commentDate = new Date(latestComment.updated);
            if (commentDate < cutoffDate) continue;
            relevantComments = [latestComment];
          }

          // Get the latest of the relevant comments
          const latestRelevant = relevantComments[relevantComments.length - 1];
          const commentText = extractCommentText(latestRelevant.body);

          // Skip if it's marked attended/acknowledged
          if (
            commentText.toLowerCase().includes("attended") ||
            commentText.toLowerCase().includes("acknowledged")
          ) {
            continue;
          }

          recentActivity.push({
            ticketKey: ticket.key,
            summary: ticket.fields.summary,
            lastComment: {
              author: latestRelevant.author?.displayName || "Unknown",
              text: commentText.substring(0, 150),
            },
            assignee: ticket.fields.assignee?.displayName || "Unassigned",
            commentedAt: latestRelevant.updated,
          });
        }
      } catch (error) {
        console.warn(`[Tickets Service] Error fetching comments for ${ticket.key}:`, error);
      }
    }

    // Sort by most recent comment
    recentActivity.sort((a, b) => new Date(b.commentedAt).getTime() - new Date(a.commentedAt).getTime());

    console.log(`[Tickets Service] Found ${recentActivity.length} tickets with recent comments`);
    return recentActivity;
  } catch (error) {
    console.error("[Tickets Service] Error fetching recent activity:", error);
    throw error;
  }
}

export interface UnattendedTicket {
  ticketKey: string;
  summary: string;
  assignee: string;
  assigneeAccountId: string | null;
  status: string;
  createdAt: string;
  lastCommentAt: string | null;   // null = no comments ever
  lastCommentBy: string | null;
  statusUpdatedAt: string;        // last time ticket status/fields changed
  silentHours: number;            // hours since last activity (comment OR status change)
  reason: "no_comments" | "no_recent_response";
  lastActivityType: "comment" | "status_change" | "none"; // what was the last activity
  isMentioned: boolean; // true if currentUser is @mentioned in any comment
}

// Fetch P1 tickets that are truly unattended:
//   - No comments at all, OR
//   - Last comment is older than `thresholdHours` (default 24h)
export interface CurrentUser {
  accountId: string;
  displayName: string;
}

export async function fetchUnattendedTickets(thresholdHours: number = 24, selectedProjects: string[] = [], currentUser?: CurrentUser): Promise<UnattendedTicket[]> {
  try {
    console.log(`[Tickets Service] Fetching unattended P1 tickets (threshold: ${thresholdHours}h)...`);

    // Build project filter from selected projects
    if (selectedProjects.length === 0) {
      console.warn("[Tickets Service] No projects selected, returning empty results.");
      return [];
    }
    const projectFilter = selectedProjects.length === 1
      ? `project = ${selectedProjects[0]}`
      : `project IN (${selectedProjects.join(", ")})`;

    const jql =
      `${projectFilter} AND customfield_10092 ~ "Priority 1" AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) ORDER BY updated DESC`;

    const PAGE_SIZE = 100;
    let startAt = 0;
    let allTickets: JiraTicket[] = [];
    let total = Infinity;

    while (startAt < total) {
      const ticketsResponse = await fetch(`${API_BASE}/api/jira/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          jql,
          maxResults: PAGE_SIZE,
          startAt,
          fields: ["summary", "status", "assignee", "created", "updated"],
          expand: ["names"],
        }),
      });

      if (!ticketsResponse.ok) {
        throw new Error(`Failed to fetch tickets: ${ticketsResponse.statusText}`);
      }

      const ticketsData = await ticketsResponse.json();
      const pageTickets: JiraTicket[] = ticketsData.issues || [];
      total = ticketsData.total ?? pageTickets.length;
      allTickets = allTickets.concat(pageTickets);
      startAt += pageTickets.length;
      console.log(`[Tickets Service] Unattended: fetched ${allTickets.length} / ${total} tickets...`);
      if (pageTickets.length < PAGE_SIZE) break;
    }    const tickets = allTickets;
    console.log(`[Tickets Service] Total active P1 tickets: ${tickets.length}`);

    const now = new Date();
    const thresholdMs = thresholdHours * 60 * 60 * 1000;
    const unattended: UnattendedTicket[] = [];

    for (const ticket of tickets) {
      try {
        const commentResponse = await fetch(
          `${API_BASE}/api/jira/api/issue/${ticket.key}/comment`,
          { method: "GET", headers: { "Content-Type": "application/json" } }
        );

        let comments: JiraComment[] = [];
        if (commentResponse.ok) {
          const commentData = await commentResponse.json();
          comments = commentData.comments || [];
        }

        const createdAt = ticket.fields.created;
        const statusUpdatedAt = ticket.fields.updated; // Jira updates this on status change, assignment, etc.
        let lastCommentAt: string | null = null;
        let lastCommentBy: string | null = null;

        // Reference times for both signals
        const commentTime = comments.length > 0 ? new Date(comments[comments.length - 1].updated) : null;
        const statusTime = new Date(statusUpdatedAt);
        const creationTime = new Date(createdAt);

        if (comments.length > 0) {
          const latest = comments[comments.length - 1];
          lastCommentAt = latest.updated;
          lastCommentBy = latest.author?.displayName || "Unknown";
        }

        // Option D: use the MOST RECENT activity — comment OR status/field change
        // This means ticket exits unattended list if either happens within threshold
        const lastActivityTime = commentTime
          ? new Date(Math.max(commentTime.getTime(), statusTime.getTime()))
          : statusTime.getTime() > creationTime.getTime() ? statusTime : creationTime;

        // Determine what the last activity type was
        let lastActivityType: "comment" | "status_change" | "none";
        if (!commentTime && statusTime.getTime() <= creationTime.getTime()) {
          lastActivityType = "none";
        } else if (!commentTime) {
          lastActivityType = "status_change";
        } else if (commentTime.getTime() >= statusTime.getTime()) {
          lastActivityType = "comment";
        } else {
          lastActivityType = "status_change";
        }

        const silentMs = now.getTime() - lastActivityTime.getTime();
        const silentHours = Math.round(silentMs / (60 * 60 * 1000));

        // Check if currentUser is @mentioned in LAST 3 comments only (ADF mention node OR plain text @name)
        const recentComments = comments.slice(-3);
        const isMentioned = currentUser ? recentComments.some((c) => {
          const text = extractCommentText(c.body);
          // Plain text mention check
          if (text.toLowerCase().includes(`@${currentUser.displayName.toLowerCase()}`)) return true;
          // ADF mention node check (accountId)
          if (typeof c.body === 'object' && c.body !== null) {
            const bodyStr = JSON.stringify(c.body);
            if (bodyStr.includes(`"id":"${currentUser.accountId}"`)) return true;
            if (bodyStr.includes(`"accountId":"${currentUser.accountId}"`)) return true;
          }
          return false;
        }) : false;

        if (silentMs >= thresholdMs) {
          unattended.push({
            ticketKey: ticket.key,
            summary: ticket.fields.summary,
            assignee: ticket.fields.assignee?.displayName || "Unassigned",
            assigneeAccountId: ticket.fields.assignee?.accountId || null,
            status: ticket.fields.status.name,
            createdAt,
            lastCommentAt,
            lastCommentBy,
            statusUpdatedAt,
            silentHours,
            reason: comments.length === 0 ? "no_comments" : "no_recent_response",
            lastActivityType,
            isMentioned,
          });
        }
      } catch (err) {
        console.warn(`[Tickets Service] Error processing ${ticket.key}:`, err);
      }
    }

    // Sort by least silent first (most recently unattended at top)
    unattended.sort((a, b) => a.silentHours - b.silentHours);

    // Filter by current user: keep only tickets assigned to user (by accountId) OR user is @mentioned in comments
    if (currentUser) {
      const filtered = unattended.filter((t) => {
        // Prefer accountId match (reliable), fallback to displayName
        const isAssigned = t.assigneeAccountId
          ? t.assigneeAccountId === currentUser.accountId
          : t.assignee === currentUser.displayName;
        if (isAssigned) return true;
        if (t.isMentioned) return true;
        return false;
      });
      console.log(`[Tickets Service] After user filter (${currentUser.displayName}): ${filtered.length} / ${unattended.length} tickets`);
      return filtered;
    }

    console.log(`[Tickets Service] Found ${unattended.length} unattended tickets`);
    return unattended;
  } catch (error) {
    console.error("[Tickets Service] Error fetching unattended tickets:", error);
    throw error;
  }
}
