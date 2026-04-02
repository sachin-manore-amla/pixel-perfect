import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { mockAlerts } from "@/data/mockData";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const unackAlerts = mockAlerts.filter((a) => !a.acknowledged).length;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-4 bg-surface-overlay shrink-0">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div className="h-4 w-px bg-border" />
              <span className="text-sm text-muted-foreground font-mono">JiraTriage</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="relative">
                <Bell className="h-4 w-4 text-muted-foreground" />
                {unackAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-critical pulse-dot" />
                )}
              </div>
              <Badge variant="outline" className="text-xs font-mono border-border text-muted-foreground">
                v1.0
              </Badge>
            </div>
          </header>
          <main className="flex-1 overflow-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
