import { useQuery } from "@tanstack/react-query";
import { fetchUnattendedTickets, UnattendedTicket } from "@/services/ticketAnalysisService";

export function useUnattendedTickets(thresholdHours: number = 24) {
  return useQuery<UnattendedTicket[], Error>({
    queryKey: ["unattended-tickets", thresholdHours],
    queryFn: () => fetchUnattendedTickets(thresholdHours),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
}
