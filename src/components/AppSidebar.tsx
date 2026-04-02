import {
  LayoutDashboard,
  AlertTriangle,
  Eye,
  MessageSquare,
  Clock,
  Bell,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
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
import { mockAlerts } from "@/data/mockData";

const navItems = [
  { title: "Overview", url: "/", icon: LayoutDashboard },
  { title: "P1 Triage", url: "/triage", icon: AlertTriangle },
  { title: "Attention", url: "/attention", icon: Eye },
  { title: "Alerts", url: "/alerts", icon: Bell },
  { title: "Comment Sync", url: "/sync", icon: MessageSquare },
  { title: "SLA Monitor", url: "/sla", icon: Clock },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const unackAlerts = mockAlerts.filter((a) => !a.acknowledged).length;

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
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-primary flex items-center justify-center">
              <span className="text-xs font-medium text-primary-foreground">KK</span>
            </div>
            <div>
              <p className="text-xs font-medium text-foreground">Kapil K.</p>
              <p className="text-xs text-muted-foreground">Manager</p>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
