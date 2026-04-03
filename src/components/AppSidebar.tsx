import {
  LayoutDashboard,
  AlertTriangle,
  Eye,
  MessageSquare,
  Clock,
  Bell,
  Brain,
  Settings,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { JiraConfigDialog } from "@/components/JiraConfigDialog";
import { useJiraAPI } from "@/hooks/use-jira-config";
import { mockAlerts } from "@/data/mockData";

interface JiraUser {
  displayName: string;
  emailAddress?: string;
  name?: string;
  accountType?: string;
}

const navItems = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "P1 Triage", url: "/triage", icon: AlertTriangle },
  { title: "Attention", url: "/attention", icon: Eye },
  { title: "AI Insights", url: "/ai-insights", icon: Brain },
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Comment Sync", url: "/sync", icon: MessageSquare },
  { title: "SLA Monitor", url: "/sla", icon: Clock },
  { title: "Settings", url: "/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const unackAlerts = mockAlerts.filter((a) => !a.acknowledged).length;
  const { get, isConfigured } = useJiraAPI();
  const [user, setUser] = useState<JiraUser | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch current user info when Jira is configured
  useEffect(() => {
    if (!isConfigured) {
      setUser(null);
      return;
    }

    const fetchUser = async () => {
      setLoading(true);
      try {
        const userData = await get<JiraUser>("/myself");
        setUser(userData);
      } catch (error) {
        console.error("Failed to fetch user info:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [isConfigured, get]);

  // Get user initials
  const getInitials = (name: string): string => {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join("");
  };

  const displayName = user?.displayName || "User";
  const initials = getInitials(displayName);
  const role = user?.accountType === "atlassian" ? "Bot" : "Developer";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-bold text-sm">JT</span>
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-sm font-semibold text-foreground">JiraTriage</h2>
              <p className="text-xs text-muted-foreground">SignalOps</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-xs uppercase tracking-wider text-muted-foreground">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      end
                      className="hover:bg-accent"
                      activeClassName="bg-accent text-accent-foreground font-medium border-l-2 border-primary"
                    >
                      <item.icon className="mr-2 h-4 w-4 shrink-0" />
                      {!collapsed && <span className="flex-1">{item.title}</span>}
                      {!collapsed && item.title === "Alerts" && unackAlerts > 0 && (
                        <Badge className="ml-auto bg-critical text-critical-foreground text-xs h-5 px-1.5 rounded">
                          {unackAlerts}
                        </Badge>
                      )}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        {!collapsed && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-primary-foreground">{initials}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground">{role}</p>
              </div>
            </div>
            <JiraConfigDialog />
          </div>
        )}
        {collapsed && (
          <div className="flex justify-center">
            <JiraConfigDialog />
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
