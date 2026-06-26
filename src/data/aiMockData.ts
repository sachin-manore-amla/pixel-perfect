import type { Ticket } from "./mockData";

export interface AITicketInsight {
  ticketKey: string;
  priorityScore: number;
  priorityReason: string;
  sentiment: "critical" | "urgent" | "moderate" | "stable";
  summary: string;
  actions: { owner: string; action: string; status: "pending" | "done" }[];
  customerFriendlyComment?: string;
  originalInternalComment?: string;
  slaRisk?: { likelihood: number; minutesUntilBreach: number | null };
}

export const aiInsights: AITicketInsight[] = [
  {
    ticketKey: "Z10LMC-3001",
    priorityScore: 95,
    priorityReason: "Production payment gateway down — multiple customers impacted, escalation language detected in comments",
    sentiment: "critical",
    summary: "Payment gateway experiencing intermittent timeouts in production. Sarah Chen is investigating payment service logs. No root cause identified yet. Multiple customer-facing transactions failing.",
    actions: [
      { owner: "Sarah Chen", action: "Complete payment service log analysis", status: "pending" },
      { owner: "Hardik Sanjay Khedkar", action: "Check load balancer health", status: "pending" },
      { owner: "Manager", action: "Notify stakeholders of payment disruption", status: "pending" },
    ],
    originalInternalComment: "Investigating payment service logs — seeing connection pool saturation on primary DB replica. Might need to failover.",
    customerFriendlyComment: "We've identified the issue affecting payment processing and our engineering team is actively investigating. We expect to have an update within the next hour.",
    slaRisk: { likelihood: 78, minutesUntilBreach: 60 },
  },
  {
    ticketKey: "Z10LMC-3002",
    priorityScore: 88,
    priorityReason: "SLA already breached — database connection pool exhaustion with active remediation in progress",
    sentiment: "urgent",
    summary: "Database connection pool reached maximum capacity, causing cascading failures. pankaj.walke@amla.io increased pool size as interim fix. Monitoring ongoing but SLA has already been breached by 2 hours.",
    actions: [
      { owner: "Dnyanada Moharir", action: "Validate pool size increase is holding", status: "done" },
      { owner: "DBA Team", action: "Review connection leak sources", status: "pending" },
      { owner: "Manager", action: "Respond to latest update from Mike", status: "pending" },
    ],
    originalInternalComment: "Pool size increased from 50 to 200. Leak suspected in the reporting module — needs DBA investigation. Temporary fix only.",
    customerFriendlyComment: "We've applied an immediate fix to resolve the performance issues you may have experienced. Our team is implementing a permanent solution to prevent recurrence.",
  },
  {
    ticketKey: "Z10LMC-3003",
    priorityScore: 92,
    priorityReason: "Unassigned P1 for 18 hours — auth service critical, no human response, SLA violated",
    sentiment: "critical",
    summary: "Authentication service returning 503 errors, detected by PagerDuty health checks. Ticket remains unassigned for 18 hours. No engineer has responded. SLA breached 14 hours ago.",
    actions: [
      { owner: "Engineering Lead", action: "Assign engineer immediately", status: "pending" },
      { owner: "On-call Engineer", action: "Investigate auth service 503s", status: "pending" },
      { owner: "Manager", action: "Escalate — ticket unassigned for 18h", status: "pending" },
    ],
    slaRisk: { likelihood: 100, minutesUntilBreach: null },
  },
  {
    ticketKey: "Z10LMC-3004",
    priorityScore: 62,
    priorityReason: "Fix deployed to staging, awaiting QA — moderate risk, actively being worked",
    sentiment: "moderate",
    summary: "CDN cache invalidation bug identified and fix deployed to staging environment. Prajakta Dhote completed the fix; now pending QA team verification before production deployment.",
    actions: [
      { owner: "QA Team", action: "Validate fix in staging environment", status: "pending" },
      { owner: "Prajakta Dhote", action: "Prepare production deployment plan", status: "pending" },
    ],
    originalInternalComment: "Fix deployed to staging, needs QA verification. Root cause was stale TTL config in CloudFront distribution.",
    customerFriendlyComment: "We've developed and tested a fix for the content delivery issue. It's currently in final validation before being released to production.",
  },
  {
    ticketKey: "Z10LMC-3005",
    priorityScore: 55,
    priorityReason: "Active investigation with heap dump analysis — waiting state but progressing",
    sentiment: "moderate",
    summary: "Memory leak in notification service causing gradual performance degradation. Hardik Sanjay Khedkar team performing heap dump analysis. Ticket in waiting state pending analysis results.",
    actions: [
      { owner: "Hardik Sanjay Khedkar", action: "Complete heap dump analysis", status: "pending" },
      { owner: "James Liu", action: "Implement fix once leak source identified", status: "pending" },
    ],
  },
  {
    ticketKey: "Z10LMC-3009",
    priorityScore: 82,
    priorityReason: "Customer-facing dashboard failures — root cause found but fix not yet deployed",
    sentiment: "urgent",
    summary: "Customer dashboard loading failures traced to API response format change. Sarah Chen identified root cause. Fix needs to be implemented and deployed. External customer impact ongoing.",
    actions: [
      { owner: "Sarah Chen", action: "Deploy API response format fix", status: "pending" },
      { owner: "Customer Support", action: "Update affected customers", status: "pending" },
    ],
    originalInternalComment: "Root cause traced to API response format change in v2.4.1 — backwards compat broken for dashboard widgets. Rolling back the schema change.",
    customerFriendlyComment: "We've identified the cause of the dashboard loading issues and are deploying a fix shortly. Your dashboard will be fully functional once the update is complete.",
  },
  {
    ticketKey: "Z10LMC-3010",
    priorityScore: 90,
    priorityReason: "Enterprise clients impacted — unassigned for 5 days, high business risk",
    sentiment: "critical",
    summary: "Multiple enterprise clients reporting missed webhook deliveries. Ticket unassigned for 5 days with SLA violated. High business risk due to enterprise client impact and contract SLA implications.",
    actions: [
      { owner: "Engineering Lead", action: "Assign senior engineer", status: "pending" },
      { owner: "Enterprise Team", action: "Identify affected client list", status: "pending" },
      { owner: "Manager", action: "Communicate remediation plan to enterprise clients", status: "pending" },
    ],
    slaRisk: { likelihood: 100, minutesUntilBreach: null },
  },
];

export function getInsight(ticketKey: string): AITicketInsight | undefined {
  return aiInsights.find((i) => i.ticketKey === ticketKey);
}
