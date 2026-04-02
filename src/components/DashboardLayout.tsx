import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Bell, Search, HelpCircle, User } from "lucide-react";
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
          {/* Dark top header bar matching reference */}
          <header className="h-12 flex items-center justify-between px-4 shrink-0"
            style={{ backgroundColor: 'hsl(var(--header-bg))', color: 'hsl(var(--header-foreground))' }}>
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-[hsl(var(--header-foreground))] hover:text-primary" />
              <div className="h-4 w-px bg-[hsl(var(--header-foreground)_/_0.2)]" />
              <span className="text-sm font-semibold tracking-wide">JIRATRIAGE</span>
              <span className="text-xs px-2 py-0.5 rounded bg-primary text-primary-foreground font-medium ml-1">DASHBOARD</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-xs opacity-70">MODE: OPS</span>
              <Search className="h-4 w-4 opacity-70 hover:opacity-100 cursor-pointer" />
              <HelpCircle className="h-4 w-4 opacity-70 hover:opacity-100 cursor-pointer" />
              <div className="relative">
                <Bell className="h-4 w-4 opacity-70 hover:opacity-100 cursor-pointer" />
                {unackAlerts > 0 && (
                  <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-critical pulse-dot" />
                )}
              </div>
              <User className="h-4 w-4 opacity-70 hover:opacity-100 cursor-pointer" />
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
