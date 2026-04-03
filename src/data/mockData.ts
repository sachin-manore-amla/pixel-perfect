export interface Ticket {
  id: string;
  key: string;
  summary: string;
  priority: "P1" | "P2" | "P3";
  status: "Open" | "In Progress" | "Waiting" | "Resolved";
  assignee: string;
  reporter: string;
  createdAt: Date;
  updatedAt: Date;
  lastManagerComment?: Date;
  lastComment?: { author: string; time: Date; text: string };
  hasNewActivity: boolean;
  isUnattended: boolean;
  slaDeadline?: Date;
  slaBreached: boolean;
  project: string;
  linkedProject?: string;
  commentSynced: boolean;
  watchers: string[];
}

export interface Alert {
  id: string;
  ticketKey: string;
  type: "unattended" | "sla_breach" | "new_activity" | "escalation";
  message: string;
  time: Date;
  acknowledged: boolean;
}

const now = new Date();
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600000);
const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);

export const mockTickets: Ticket[] = [
  { id: "1", key: "Z10LMC-3001", summary: "Payment gateway timeout in production", priority: "P1", status: "Open", assignee: "Sarah Chen", reporter: "Monitor Bot", createdAt: hoursAgo(2), updatedAt: hoursAgo(1), hasNewActivity: true, isUnattended: true, slaDeadline: hoursAgo(-1), slaBreached: false, project: "Z10LMC", commentSynced: false, watchers: [], lastComment: { author: "Sarah Chen", time: hoursAgo(1), text: "Investigating payment service logs" } },
  { id: "2", key: "Z10LMC-3002", summary: "Database connection pool exhaustion", priority: "P1", status: "In Progress", assignee: "Dnyanada Moharir", reporter: "Alert System", createdAt: hoursAgo(6), updatedAt: hoursAgo(2), lastManagerComment: hoursAgo(4), hasNewActivity: true, isUnattended: false, slaDeadline: hoursAgo(2), slaBreached: true, project: "Z10LMC", commentSynced: true, watchers: ["Manager"], lastComment: { author: "pankaj.walke@amla.io", time: hoursAgo(2), text: "Pool size increased, monitoring" } },
  { id: "3", key: "Z10LMC-3003", summary: "Auth service returning 503 errors", priority: "P1", status: "Open", assignee: "Unassigned", reporter: "PagerDuty", createdAt: hoursAgo(18), updatedAt: hoursAgo(12), hasNewActivity: false, isUnattended: true, slaDeadline: hoursAgo(14), slaBreached: true, project: "Z10LMC", commentSynced: false, watchers: [], lastComment: { author: "PagerDuty", time: hoursAgo(18), text: "Auto-generated: Auth service health check failing" } },
  { id: "4", key: "Z10LMC-3004", summary: "CDN cache invalidation not propagating", priority: "P1", status: "In Progress", assignee: "Prajakta Dhote", reporter: "QA Team", createdAt: daysAgo(3), updatedAt: daysAgo(1), lastManagerComment: daysAgo(2), hasNewActivity: true, isUnattended: false, slaBreached: false, project: "Z10LMC", commentSynced: true, watchers: ["Manager", "QA Lead"], lastComment: { author: "Prajakta Dhote", time: daysAgo(1), text: "Fix deployed to staging, needs QA verification" } },
  { id: "5", key: "Z10LMC-3005", summary: "Memory leak in notification service", priority: "P1", status: "Waiting", assignee: "James Liu", reporter: "Hardik Sanjay Khedkar", createdAt: daysAgo(8), updatedAt: daysAgo(3), lastManagerComment: daysAgo(5), hasNewActivity: true, isUnattended: false, slaBreached: false, project: "Z10LMC", commentSynced: false, watchers: ["Manager"], lastComment: { author: "Hardik Sanjay Khedkar", time: daysAgo(3), text: "Heap dump analysis in progress" } },
  { id: "6", key: "Z10LMC-3006", summary: "SSL certificate expiry on API gateway", priority: "P1", status: "Open", assignee: "Ana Ruiz", reporter: "Security Bot", createdAt: daysAgo(12), updatedAt: daysAgo(7), hasNewActivity: false, isUnattended: true, slaBreached: true, project: "Z10LMC", commentSynced: false, watchers: [], lastComment: { author: "Security Bot", time: daysAgo(12), text: "Certificate expires in 5 days" } },
  { id: "7", key: "Z10LMC-3007", summary: "Rate limiter misconfigured for partner API", priority: "P1", status: "In Progress", assignee: "Akash Kulkarni", reporter: "Partner Team", createdAt: daysAgo(18), updatedAt: daysAgo(10), lastManagerComment: daysAgo(15), hasNewActivity: true, isUnattended: false, slaBreached: true, project: "Z10LMC", linkedProject: "PARTNER", commentSynced: true, watchers: ["Manager"], lastComment: { author: "Akash Kulkarni", time: daysAgo(10), text: "Rate limit adjusted, partner team to verify" } },
  { id: "8", key: "Z10LMC-3008", summary: "Data pipeline failure causing report delays", priority: "P1", status: "Waiting", assignee: "Lena Park", reporter: "Data Team", createdAt: daysAgo(25), updatedAt: daysAgo(20), lastManagerComment: daysAgo(22), hasNewActivity: false, isUnattended: false, slaBreached: true, project: "Z10LMC", commentSynced: false, watchers: ["Manager", "Data Lead"], lastComment: { author: "Data Team", time: daysAgo(20), text: "Waiting for infra team to provision new nodes" } },
  { id: "9", key: "Z10LMC-3009", summary: "Customer dashboard loading failures", priority: "P1", status: "In Progress", assignee: "Sarah Chen", reporter: "Customer Support", createdAt: hoursAgo(4), updatedAt: hoursAgo(1), hasNewActivity: true, isUnattended: false, slaBreached: false, project: "Z10LMC", linkedProject: "Z10LMC", commentSynced: true, watchers: ["Manager"], lastComment: { author: "Sarah Chen", time: hoursAgo(1), text: "Root cause traced to API response format change" } },
  { id: "10", key: "Z10LMC-3010", summary: "Webhook delivery failures for enterprise clients", priority: "P1", status: "Open", assignee: "Unassigned", reporter: "Enterprise Team", createdAt: daysAgo(5), updatedAt: daysAgo(2), hasNewActivity: false, isUnattended: true, slaBreached: true, project: "Z10LMC", commentSynced: false, watchers: [], lastComment: { author: "Enterprise Team", time: daysAgo(5), text: "Multiple enterprise clients reporting missed webhooks" } },
];

export const mockAlerts: Alert[] = [
  { id: "a1", ticketKey: "Z10LMC-3001", type: "unattended", message: "P1 ticket Z10LMC-3001 has been unattended for 2 hours", time: hoursAgo(0.5), acknowledged: false },
  { id: "a2", ticketKey: "Z10LMC-3002", type: "sla_breach", message: "SLA breached on Z10LMC-3002 — response deadline passed 2 hours ago", time: hoursAgo(2), acknowledged: false },
  { id: "a3", ticketKey: "Z10LMC-3003", type: "escalation", message: "Z10LMC-3003 escalated — unassigned P1 for 18 hours", time: hoursAgo(6), acknowledged: false },
  { id: "a4", ticketKey: "Z10LMC-3005", type: "new_activity", message: "New comment on Z10LMC-3005 after your last response", time: daysAgo(3), acknowledged: true },
  { id: "a5", ticketKey: "Z10LMC-3006", type: "sla_breach", message: "SSL cert ticket Z10LMC-3006 unattended — SLA violated", time: daysAgo(5), acknowledged: true },
  { id: "a6", ticketKey: "Z10LMC-3010", type: "unattended", message: "Z10LMC-3010 unassigned for 5 days — enterprise impact", time: daysAgo(2), acknowledged: false },
  { id: "a7", ticketKey: "Z10LMC-3007", type: "new_activity", message: "Partner team responded on Z10LMC-3007", time: daysAgo(10), acknowledged: true },
];

export function getBucket(ticket: Ticket): "24h" | "15d" | "30d" | "older" {
  const hours = (now.getTime() - ticket.createdAt.getTime()) / 3600000;
  if (hours <= 24) return "24h";
  if (hours <= 24 * 15) return "15d";
  if (hours <= 24 * 30) return "30d";
  return "older";
}
