/**
 * Central Jira utilities — no hardcoded URLs or project keys.
 * All config comes from environment variables.
 */

export const API_BASE = import.meta.env.VITE_API_URL || "";

const JIRA_INSTANCE = (import.meta.env.VITE_JIRA_INSTANCE_URL || "").replace(/\/$/, "");

/**
 * Build a Jira issue browse URL dynamically from env.
 * e.g. getJiraIssueUrl("Z10-123") → "https://company.atlassian.net/browse/Z10-123"
 */
export function getJiraIssueUrl(issueKey: string): string {
  if (!JIRA_INSTANCE) {
    console.warn("[jira] VITE_JIRA_INSTANCE_URL not set — ticket links will be broken");
    return `#${issueKey}`;
  }
  return `${JIRA_INSTANCE}/browse/${issueKey}`;
}
