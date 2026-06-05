import { useQuery } from "@tanstack/react-query";
import {
  fetchP1TicketsWithComments,
  type AttentionRequired,
  type CurrentUser,
} from "@/services/ticketAnalysisService";

export function useTicketsWithAnalysis(daysWindow: 1 | 15 | 30 = 30, selectedProjects: string[] = [], currentUser?: CurrentUser) {
  return useQuery({
    queryKey: ["tickets-with-analysis", daysWindow, selectedProjects.sort().join(","), currentUser?.accountId ?? ""],
    queryFn: () => fetchP1TicketsWithComments(daysWindow, selectedProjects, currentUser),
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });
}
