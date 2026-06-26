import {
  Eye,
  MessageSquare,
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
import { useJiraAPI } from "@/hooks/use-jira-config";

interface JiraUser {
  displayName: string;
  emailAddress?: string;
  name?: string;
  accountType?: string;
}

const navItems = [
  { title: "Attention", url: "/attention", icon: Eye },
  { title: "Comment Sync", url: "/sync", icon: MessageSquare },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
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
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2 border-t border-sidebar-border" />
    </Sidebar>
  );
}
