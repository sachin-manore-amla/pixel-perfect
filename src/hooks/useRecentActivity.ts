import { useQuery } from "@tanstack/react-query";
import { fetchRecentActivity, NewActivity } from "@/services/ticketAnalysisService";

export function useRecentActivity(daysWindow: number = 1) {
  return useQuery<NewActivity[], Error>({
    queryKey: ["recent-activity", daysWindow],
    queryFn: () => fetchRecentActivity(daysWindow),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
}
