import { useState, useEffect } from "react";
import { mockTickets } from "@/data/mockData";
import { Activity, AlertTriangle, Eye, Clock, CheckCircle, Loader2 } from "lucide-react";
import { useJiraJQLSearch } from "@/hooks/use-jira-config";

interface JiraIssue {
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
  };
}

interface SearchResponse {
  issues: JiraIssue[];
  total: number;
}

export function StatsBar() {
  const [p1Total, setP1Total] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { search, isConfigured } = useJiraJQLSearch();

  // Fetch real P1 count from Jira
  useEffect(() => {
    const fetchP1Count = async () => {
      // If not configured, use mock data
      if (!isConfigured) {
        const mockP1 = mockTickets.filter((t) => t.priority === "P1");
        setP1Total(mockP1.length);
        return;
      }

      try {
        setIsLoading(true);
        const jql = `project = Z10-LMC AND "Tags[Short text]" ~ 'Priority 1' AND status NOT IN (Done, "QA Done", "QA Done-HotFix", RFT, "RFT ON HOT FIX", "RFT on Stage", RFT-HotFix, Rejected)`;
        const response = await search<SearchResponse>(jql, {
          maxResults: 100, // Fetch actual issues for reference
        });       
        setP1Total(response?.issues.length ?? 0);
      } catch (error) {
        console.error("Failed to fetch P1 count from Jira:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchP1Count();
  }, [isConfigured, search]);

  // Determine display count
  const displayP1Count = p1Total ?? 0;

  // Get mock data for other calculations
  const p1 = mockTickets.filter((t) => t.priority === "P1");
  const unattended = p1.filter((t) => t.isUnattended).length;
  const slaBreached = p1.filter((t) => t.slaBreached).length;
  const needsAttention = p1.filter((t) => t.hasNewActivity && t.lastManagerComment).length;
  const resolved = p1.filter((t) => t.status === "Resolved").length;

  const stats = [
    { 
      label: "Total P1", 
      value: displayP1Count, 
      icon: Activity, 
      borderColor: "border-l-primary",
      isLoading: isLoading && isConfigured
    },
    { label: "Unattended", value: unattended, icon: Clock, borderColor: "border-l-critical" },
    { label: "SLA Breached", value: slaBreached, icon: AlertTriangle, borderColor: "border-l-warning" },
    { label: "Needs Response", value: needsAttention, icon: Eye, borderColor: "border-l-info" },
    { label: "Resolved", value: resolved, icon: CheckCircle, borderColor: "border-l-success" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className={`rounded bg-card border border-border border-l-4 ${s.borderColor} p-4 animate-slide-in`}
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wide">{s.label}</p>
          <div className="flex items-center gap-2 mt-1">
            {s.isLoading && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            <p className="text-2xl font-bold text-foreground">{s.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
