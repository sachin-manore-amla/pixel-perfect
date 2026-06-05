import { useQuery } from "@tanstack/react-query";
import { fetchUnattendedTickets, UnattendedTicket, CurrentUser } from "@/services/ticketAnalysisService";

export function useUnattendedTickets(thresholdHours: number = 24, selectedProjects: string[] = [], currentUser?: CurrentUser) {
  return useQuery<UnattendedTicket[], Error>({
    queryKey: ["unattended-tickets", thresholdHours, selectedProjects.sort().join(","), currentUser?.accountId],
    queryFn: () => fetchUnattendedTickets(thresholdHours, selectedProjects, currentUser),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
