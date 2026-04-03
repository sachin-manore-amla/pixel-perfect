import { useState, useCallback, useEffect } from "react";
import { useJiraAPI } from "./use-jira-config";

export interface TicketWithSummary {
  key: string;
  id: string;
  summary: string;
  priority: string;
  status: string;
  assignee?: string;
  lastComment?: {
    author: string;
    body: string;
    created: string;
  };
  created: string;
  updated: string;
  priorityScore: number;
  aiSummary: string;
}

interface JiraComment {
  id: string;
  author: {
    displayName: string;
    emailAddress: string;
  };
  body: string;
  created: string;
}

interface JiraIssueDetail {
  key: string;
  id: string;
  fields: {
    summary: string;
    priority?: {
      name: string;
    };
    status: {
      name: string;
    };
    assignee?: {
      displayName: string;
    } | null;
    created: string;
    updated: string;
    changelog?: {
      histories: Array<{
        created: string;
        items: Array<{
          field: string;
          fromString?: string;
          toString?: string;
        }>;
      }>;
    };
  };
}

/**
 * Generates an AI summary from ticket data
 */
function generateTicketSummary(ticket: JiraIssueDetail, lastComment?: JiraComment): string {
  const priorityLevel = ticket.fields.priority?.name || "Medium";
  const status = ticket.fields.status.name;
  const assignee = ticket.fields.assignee?.displayName || "Unassigned";
  
  let summary = `${ticket.key}: ${ticket.fields.summary}. `;
  summary += `Status: ${status}, Priority: ${priorityLevel}, Assigned to: ${assignee}. `;
  
  if (lastComment) {
    summary += `Latest comment from ${lastComment.author.displayName}: "${lastComment.body.substring(0, 100)}...". `;
  }
  
  summary += `Last updated: ${new Date(ticket.fields.updated).toLocaleDateString()}.`;
  
  return summary;
}

/**
 * Calculates priority score based on priority level and time since last update
 */
function calculatePriorityScore(ticket: JiraIssueDetail, lastCommentDate?: string): number {
  let score = 50; // Base score
  
  // Priority weight
  const priorityName = ticket.fields.priority?.name || "Medium";
  if (priorityName === "Highest" || priorityName === "Critical") score += 45;
  else if (priorityName === "High") score += 30;
  else if (priorityName === "Medium") score += 15;
  
  // Status weight
  if (ticket.fields.status.name === "In Progress") score += 15;
  else if (ticket.fields.status.name === "Blocked") score += 20;
  else if (ticket.fields.status.name === "Open") score += 10;
  
  // Unassigned penalty/bonus
  if (!ticket.fields.assignee) score -= 10;
  
  // Time since last update (more recent = higher priority)
  const lastUpdate = lastCommentDate || ticket.fields.updated;
  const hoursSinceUpdate = (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60);
  
  if (hoursSinceUpdate < 1) score += 20;
  else if (hoursSinceUpdate < 24) score += 10;
  
  return Math.min(100, Math.max(0, score));
}

/**
 * Hook to fetch tickets with AI summaries
 */
export function useTicketSummaries() {
  const { isConfigured } = useJiraAPI();
  const [tickets, setTickets] = useState<TicketWithSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchTicketSummaries = useCallback(async () => {
    setLoading(true);
    setError(null);
    console.log("[TICKET SUMMARIES] fetchTicketSummaries called, isConfigured:", isConfigured);

    try {
      // Fetch tickets from Jira
      const jql = `project = "Z10-LMC" AND type IN (Bug, Defect, Task) AND status NOT IN (Done, Closed, Rejected) ORDER BY updated DESC, priority DESC`;

      console.log("[TICKET SUMMARIES] Fetching with JQL:", jql);

      // Use POST to /api/jira/search endpoint
      const response = await fetch("http://localhost:3001/api/jira/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql,
          maxResults: 20,
          fields: ["summary", "priority", "status", "assignee", "created", "updated", "comment"],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const searchData = await response.json();
      console.log("[TICKET SUMMARIES] Search returned", searchData.issues?.length || 0, "tickets");
      
      const ticketsWithSummaries: TicketWithSummary[] = [];

      // Process each ticket
      for (const issue of searchData.issues || []) {
        try {
          // Extract comments from the search response
          let lastComment: JiraComment | undefined;
          const comments = issue.fields?.comment?.comments || [];
          if (comments.length > 0) {
            lastComment = comments[comments.length - 1];
          }

          console.log(`[TICKET SUMMARIES] Processing ${issue.key}, comments: ${comments.length}`);

          const priorityScore = calculatePriorityScore(issue, lastComment?.created);
          const aiSummary = generateTicketSummary(issue, lastComment);

          ticketsWithSummaries.push({
            key: issue.key,
            id: issue.id,
            summary: issue.fields.summary,
            priority: issue.fields.priority?.name || "Medium",
            status: issue.fields.status.name,
            assignee: issue.fields.assignee?.displayName,
            lastComment: lastComment
              ? {
                  author: lastComment.author.displayName,
                  body: lastComment.body,
                  created: lastComment.created,
                }
              : undefined,
            created: issue.fields.created,
            updated: issue.fields.updated,
            priorityScore,
            aiSummary,
          });

          console.log(
            `[TICKET SUMMARIES] ${issue.key}: Priority Score: ${priorityScore}`
          );
        } catch (err) {
          console.error(`[TICKET SUMMARIES] Failed to process ${issue.key}:`, err);
        }
      }

      // Sort by priority score (highest first)
      ticketsWithSummaries.sort((a, b) => b.priorityScore - a.priorityScore);

      setTickets(ticketsWithSummaries);

      console.log(
        `[TICKET SUMMARIES] Total: ${ticketsWithSummaries.length} tickets`
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch ticket summaries";
      console.error("[TICKET SUMMARIES] Error:", errorMessage);
      setError(errorMessage);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  // Fetch on mount
  useEffect(() => {
    fetchTicketSummaries();
  }, [fetchTicketSummaries]);

  return {
    tickets,
    loading,
    error,
    refetch: fetchTicketSummaries,
  };
}
