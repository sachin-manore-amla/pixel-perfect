import { useQuery } from "@tanstack/react-query";
import {
  fetchP1TicketsWithComments,
  type AttentionRequired,
} from "@/services/ticketAnalysisService";

export function useTicketsWithAnalysis(daysWindow: 1 | 15 | 30 = 30) {
  return useQuery({
    queryKey: ["tickets-with-analysis", daysWindow],
    queryFn: () => fetchP1TicketsWithComments(daysWindow),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 60 * 60 * 1000, // 1 hour (was cacheTime)
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
    retry: 2,
  });
}
