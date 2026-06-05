import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export function useJiraProjects() {
  return useQuery<JiraProject[], Error>({
    queryKey: ["jira-projects"],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/jira/projects`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}: Failed to fetch projects`);
      }
      const data = await res.json();
      return data.projects as JiraProject[];
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    retryDelay: 1000,
  });
}
