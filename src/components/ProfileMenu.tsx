import { useState, useRef, useEffect } from "react";
import { LogOut, FolderOpen, ChevronDown, User } from "lucide-react";
import { useJiraConfig } from "@/hooks/use-jira-config";
import { useSelectedProjects } from "@/hooks/useSelectedProjects";
import { useCurrentJiraUser } from "@/hooks/useCurrentJiraUser";
import { ProjectSelector } from "@/components/ProjectSelector";

export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [showProjectSelector, setShowProjectSelector] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { config, clearConfig } = useJiraConfig();
  const { selectedProjects, clearSelectedProjects } = useSelectedProjects();
  const { data: currentUser } = useCurrentJiraUser();

  const displayName = currentUser?.displayName || config?.email || "User";
  const email = config?.email || "";
  const initials = displayName
    .split(" ")
    .slice(0, 2)
    .map((n: string) => n[0]?.toUpperCase() || "")
    .join("");

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    clearConfig();
    clearSelectedProjects();
    setOpen(false);
    window.location.reload();
  };

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/10 transition-colors"
      >
        <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
          {initials || <User className="h-3 w-3" />}
        </div>
        <span className="text-xs font-medium max-w-[100px] truncate hidden sm:block">
          {displayName}
        </span>
        <ChevronDown className={`h-3 w-3 opacity-70 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && !showProjectSelector && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Profile Info */}
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0">
                {initials || <User className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              </div>
            </div>
            {/* Selected projects count */}
            <div className="mt-2 flex items-center gap-1.5">
              <FolderOpen className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                {selectedProjects.length > 0
                  ? `${selectedProjects.length} project${selectedProjects.length > 1 ? "s" : ""} selected`
                  : "No projects selected"}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="py-1">
            <button
              onClick={() => setShowProjectSelector(true)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors text-left"
            >
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              Edit Selected Projects
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-border py-1">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors text-left"
            >
              <LogOut className="h-4 w-4" />
              Logout / Reconfigure Jira
            </button>
          </div>
        </div>
      )}

      {/* Project Selector inline in dropdown */}
      {open && showProjectSelector && (
        <div className="absolute right-0 top-full mt-2 w-[480px] bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground">Edit Selected Projects</span>
            <button
              onClick={() => setShowProjectSelector(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>
          </div>
          <ProjectSelector
            onDone={() => {
              setShowProjectSelector(false);
              setOpen(false);
              window.location.reload();
            }}
          />
        </div>
      )}
    </div>
  );
}
