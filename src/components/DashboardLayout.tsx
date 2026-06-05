import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

import { ProfileMenu } from "@/components/ProfileMenu";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
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
              <ProfileMenu />
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
