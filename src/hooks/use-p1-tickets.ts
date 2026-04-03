import { useState, useCallback, useEffect } from "react";
import { useJiraAPI } from "./use-jira-config";

export interface JiraIssue {
  key: string;
  id: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
    priority?: {
      name: string;
    };
    assignee?: {
      displayName: string;
    } | null;
    created: string;
    updated: string;
    components?: Array<{ name: string }>;
  };
}

export interface TicketWithAttention extends JiraIssue {
  watchersCount: number;
  isAttended: boolean; // true if > 1 watcher, false if exactly 1 watcher
}

interface WatchersResponse {
  watchers: Array<{
    self: string;
    accountId: string;
    displayName: string;
    emailAddress?: string;
  }>;
}

/**
 * Hook to fetch P1 tickets from Jira and check their attendance status based on watchers
 */
export function useP1Tickets() {
  const { isConfigured } = useJiraAPI();
  const [tickets, setTickets] = useState<TicketWithAttention[]>([]);
  const [unattendedTickets, setUnattendedTickets] = useState<TicketWithAttention[]>([]);
  const [attendedTickets, setAttendedTickets] = useState<TicketWithAttention[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchP1Tickets = useCallback(async () => {
    if (!isConfigured) {
      setTickets([]);
      setUnattendedTickets([]);
      setAttendedTickets([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // JQL query for P1 tickets
      // project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected) AND updated >= -1d
      const jql = `project = "Z10-LMC" AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", "RFT-HotFix", Rejected) AND updated >= -1d`;

      console.log("[P1 TICKETS] Fetching with JQL:", jql);

      // Use POST to /api/jira/search endpoint with JQL in body
      const response = await fetch("http://localhost:3001/api/jira/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql,
          maxResults: 100,
          fields: ["summary", "status", "priority", "assignee", "components", "labels", "created", "updated", "watches"],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const searchData = await response.json();

      // Now fetch watchers for each ticket
      const ticketsWithWatchers: TicketWithAttention[] = [];

      for (const issue of searchData.issues || []) {
        try {
          let watchersCount = 0;
          let hasMukulAsWatcher = false;
          
          // First, try to get watcher count from the search result's watches field
          if (issue.fields?.watches?.watchCount) {
            watchersCount = issue.fields.watches.watchCount;
            console.log(`[P1 TICKETS] ${issue.key}: Got ${watchersCount} watchers from search result`);
          }

          // Call watchers endpoint to get detailed watcher info
          const watchersResponse = await fetch(
            `http://localhost:3001/api/jira/issue/${issue.key}/watchers`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          if (watchersResponse.ok) {
            const watchersData = (await watchersResponse.json()) as WatchersResponse;
            watchersCount = watchersData.watchers?.length || 0;
            
            // Check if mukul.chaudhari@amla.io is in the watchers list
            hasMukulAsWatcher = watchersData.watchers?.some(
              (w) => w.emailAddress === "mukul.chaudhari@amla.io" || w.displayName.toLowerCase().includes("mukul")
            ) || false;
            
            console.log(`[P1 TICKETS] ${issue.key}: Fetched ${watchersCount} watchers from endpoint`);
          } else {
            console.warn(`[P1 TICKETS] Failed to fetch watchers endpoint for ${issue.key}: ${watchersResponse.status}`);
          }
          
          // Mark as attended only if: (1) has more than 1 watcher AND (2) mukul is in the watchers list
          const isAttended = watchersCount > 1 && hasMukulAsWatcher;

          ticketsWithWatchers.push({
            ...issue,
            watchersCount,
            isAttended,
          });

          console.log(
            `[P1 TICKETS] ${issue.key}: ${watchersCount} watchers, Mukul watching: ${hasMukulAsWatcher}, ${isAttended ? "ATTENDED" : "UNATTENDED"}`
          );
        } catch (err) {
          console.error(`[P1 TICKETS] Failed to fetch watchers for ${issue.key}:`, err);
          console.error(`[P1 TICKETS] Response status for ${issue.key}:`, (err instanceof Error) ? err.message : 'Unknown error');
          // Try to get at least a count from the issue itself if available
          // For now, default to unattended if we can't fetch watchers
          ticketsWithWatchers.push({
            ...issue,
            watchersCount: 0,
            isAttended: false,
          });
        }
      }

      // Separate into attended and unattended
      const unattended = ticketsWithWatchers.filter((t) => !t.isAttended);
      const attended = ticketsWithWatchers.filter((t) => t.isAttended);

      setTickets(ticketsWithWatchers);
      setUnattendedTickets(unattended);
      setAttendedTickets(attended);

      console.log(
        `[P1 TICKETS] Total: ${ticketsWithWatchers.length}, Unattended: ${unattended.length}, Attended: ${attended.length}`
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to fetch P1 tickets";
      console.error("[P1 TICKETS] Error:", errorMessage);
      setError(errorMessage);
      setTickets([]);
      setUnattendedTickets([]);
      setAttendedTickets([]);
    } finally {
      setLoading(false);
    }
  }, [isConfigured]);

  // Fetch on mount
  useEffect(() => {
    fetchP1Tickets();
  }, [fetchP1Tickets]);

  return {
    tickets,
    unattendedTickets,
    attendedTickets,
    loading,
    error,
    refetch: fetchP1Tickets,
  };
}
