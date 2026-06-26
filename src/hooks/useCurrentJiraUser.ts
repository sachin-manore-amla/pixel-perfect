import { useQuery } from "@tanstack/react-query";

interface JiraCurrentUser {
  accountId: string;
  displayName: string;
  emailAddress?: string;
}

async function fetchCurrentJiraUser(): Promise<JiraCurrentUser> {
  const apiBase = import.meta.env.VITE_API_URL || "";
  const response = await fetch(`${apiBase}/api/jira/current-user`);
  if (!response.ok) {
    throw new Error("Failed to fetch current Jira user");
  }
  return response.json();
}

export function useCurrentJiraUser() {
  return useQuery<JiraCurrentUser, Error>({
    queryKey: ["current-jira-user"],
    queryFn: fetchCurrentJiraUser,
    staleTime: 30 * 60 * 1000, // 30 minutes — user doesn't change often
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
