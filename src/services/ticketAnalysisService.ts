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
    assignee?: { displayName: string } | null;
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
export async function fetchP1TicketsWithComments(daysWindow: number = 30): Promise<{
  tickets: JiraTicket[];
  attentionRequired: AttentionRequired[];
  attentionCount: number;
}> {
  try {
    console.log(`[Tickets Service] Step 1: Fetching P1 tickets from last ${daysWindow} days...`);

    // Step 1: Fetch P1 tickets with broader status filtering (original curl approach)
    const jql =
      'project = Z10-LMC AND customfield_10092 ~ "Priority 1" AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected)';

    const ticketsResponse = await fetch("http://localhost:3001/api/jira/search", {
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
    let tickets: JiraTicket[] = ticketsData.issues || [];
    console.log(`[Tickets Service] Found ${tickets.length} P1 tickets total`);

    // Filter for "Dev In Progress" status
    tickets = tickets.filter((t) => t.fields.status.name === "Dev In Progress");
    console.log(`[Tickets Service] Found ${tickets.length} P1 tickets with "Dev In Progress" status`);

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
          `http://localhost:3001/api/jira/api/issue/${ticket.key}/comment`,
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
    console.log("[Tickets Service] Step 3: Analyzing comments for unanswered questions...");
    const attentionRequired: AttentionRequired[] = [];
    const now = new Date();
    const windowMs = daysWindow * 24 * 60 * 60 * 1000;
    const windowStart = new Date(now.getTime() - windowMs);

    for (const [, ticketData] of ticketsWithComments.entries()) {
      const { ticket, comments } = ticketData;

      if (comments.length === 0) {
        console.log(`[Tickets Service] Skipping ${ticket.key}: No comments`);
        continue;
      }

      // Check if ticket has recent activity (comments or updates) within the time window
      const hasRecentComments = comments.some((c) => new Date(c.updated) >= windowStart);
      const ticketUpdatedDate = new Date(ticket.fields.updated);
      const ticketIsRecent = ticketUpdatedDate >= windowStart;

      if (!hasRecentComments && !ticketIsRecent) {
        console.log(
          `[Tickets Service] Skipping ${ticket.key}: No activity in last ${daysWindow} days`
        );
        continue;
      }

      // Get the latest comment to check if it has unanswered questions
      const latestComment = comments.length > 0 ? comments[comments.length - 1] : null;

      if (latestComment) {
        // Handle both string and ADF (Atlassian Document Format) body formats
        const bodyText = typeof latestComment.body === "string" 
          ? latestComment.body 
          : JSON.stringify(latestComment.body).substring(0, 50);
        console.log(
          `[Tickets Service] ${ticket.key} - Latest comment by ${latestComment.author?.displayName}: "${bodyText}..."`
        );
      }

      // Analyze for unanswered comments
      const analysis = analyzeCommentsForUnanswered(comments);
      console.log(
        `[Tickets Service] ${ticket.key} - Needs Attention: ${analysis.needsAttention}, Reason: ${analysis.reason}`
      );

      if (analysis.needsAttention) {
        attentionRequired.push({
          ticketKey: ticket.key,
          ticketSummary: ticket.fields.summary,
          reason: analysis.reason,
          priority: analysis.priority,
          updated: ticket.fields.updated,
          status: ticket.fields.status.name,
          comments: comments,
          commentCount: comments.length,
        });
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

function analyzeCommentsForUnanswered(comments: JiraComment[]): AnalysisResult {
  const keywordPatterns = {
    questions: ["?", "why", "how", "what", "when", "where"],
    blockers: ["blocking", "blocked", "blocker", "stuck", "cannot"],
    help: ["help", "urgent", "asap", "need", "please"],
    unresolved: ["unresolved", "pending", "waiting", "pending approval"],
  };

  let questionCount = 0;
  let blockerCount = 0;
  let helpCount = 0;
  let unresolvedCount = 0;

  for (const comment of comments) {
    const text = extractCommentText(comment.body).toLowerCase();

    if (keywordPatterns.questions.some((kw) => text.includes(kw))) {
      questionCount++;
    }
    if (keywordPatterns.blockers.some((kw) => text.includes(kw))) {
      blockerCount++;
    }
    if (keywordPatterns.help.some((kw) => text.includes(kw))) {
      helpCount++;
    }
    if (keywordPatterns.unresolved.some((kw) => text.includes(kw))) {
      unresolvedCount++;
    }
  }

  // Determine if ticket needs attention
  const needsAttention =
    questionCount > 0 || blockerCount > 0 || helpCount > 0 || unresolvedCount > 0;

  if (!needsAttention) {
    return { needsAttention: false, reason: "", priority: "LOW" };
  }

  // Determine priority
  let priority: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  let reason = "";

  if (blockerCount > 0 && helpCount > 0) {
    priority = "HIGH";
    reason = `Blocking issue with urgency (${blockerCount} blockers, ${helpCount} urgent mentions)`;
  } else if (blockerCount > 0) {
    priority = "HIGH";
    reason = `Ticket has blocking issues (${blockerCount} mentions)`;
  } else if (helpCount > 0 && questionCount > 0) {
    priority = "MEDIUM";
    reason = `Unanswered questions with urgency requests (${questionCount} questions, ${helpCount} help requests)`;
  } else if (helpCount > 0) {
    priority = "MEDIUM";
    reason = `Urgent response needed (${helpCount} urgent mentions)`;
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
export async function fetchRecentActivity(daysWindow: number = 1): Promise<NewActivity[]> {
  try {
    console.log(`[Tickets Service] Fetching recent activity from last ${daysWindow} days...`);

    // Fetch P1 tickets - all active ones
    const jql =
      'project = Z10-LMC AND customfield_10092 ~ "Priority 1" AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected)';

    const ticketsResponse = await fetch("http://localhost:3001/api/jira/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jql,
        maxResults: 50,
        fields: ["summary", "assignee", "created", "updated"],
      }),
    });

    if (!ticketsResponse.ok) {
      throw new Error(`Failed to fetch recent activity: ${ticketsResponse.statusText}`);
    }

    const ticketsData = await ticketsResponse.json();
    const tickets: JiraTicket[] = ticketsData.issues || [];
    console.log(`[Tickets Service] Found ${tickets.length} tickets with recent activity`);

    // Fetch comments for each ticket
    const recentActivity: NewActivity[] = [];
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysWindow);

    for (const ticket of tickets) {
      try {
        const commentResponse = await fetch(
          `http://localhost:3001/api/jira/api/issue/${ticket.key}/comment`,
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

          if (comments.length > 0) {
            // Get the latest comment
            const latestComment = comments[comments.length - 1];
            const commentDate = new Date(latestComment.updated);
            
            // Only include if comment is recent enough
            if (commentDate >= cutoffDate) {
              const commentText = extractCommentText(latestComment.body);

              recentActivity.push({
                ticketKey: ticket.key,
                summary: ticket.fields.summary,
                lastComment: {
                  author: latestComment.author?.displayName || "Unknown",
                  text: commentText.substring(0, 150),
                },
                assignee: ticket.fields.assignee?.displayName || "Unassigned",
                commentedAt: latestComment.updated,
              });
            }
          }
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
