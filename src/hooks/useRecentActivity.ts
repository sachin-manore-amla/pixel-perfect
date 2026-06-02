import { useQuery } from "@tanstack/react-query";
import { fetchRecentActivity, NewActivity } from "@/services/ticketAnalysisService";

export function useRecentActivity(daysWindow: number = 1, currentUserDisplayName?: string) {
  return useQuery<NewActivity[], Error>({
    queryKey: ["recent-activity", daysWindow, currentUserDisplayName],
    queryFn: () => fetchRecentActivity(daysWindow, currentUserDisplayName),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
