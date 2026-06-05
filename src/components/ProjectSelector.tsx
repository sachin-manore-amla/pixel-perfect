import { useState, useEffect } from "react";
import { Loader2, FolderOpen, Check, Search, ChevronRight, RefreshCw } from "lucide-react";
import { useJiraProjects, JiraProject } from "@/hooks/useJiraProjects";
import { useSelectedProjects } from "@/hooks/useSelectedProjects";

interface ProjectSelectorProps {
  onDone: () => void;
  /** If true, shows as a full-screen first-time setup modal */
  isFirstTime?: boolean;
}

export function ProjectSelector({ onDone, isFirstTime = false }: ProjectSelectorProps) {
  const { data: projects, isLoading, error, refetch } = useJiraProjects();
  const { selectedProjects, setSelectedProjects } = useSelectedProjects();
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedProjects));
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLocalSelected(new Set(selectedProjects));
  }, [selectedProjects]);

  const filtered = (projects || []).filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.key.toLowerCase().includes(search.toLowerCase())
  );

  const toggleProject = (key: string) => {
    setLocalSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setLocalSelected(new Set((projects || []).map((p) => p.key)));
  const clearAll = () => setLocalSelected(new Set());

  const handleSave = () => {
    setSelectedProjects(Array.from(localSelected));
    onDone();
  };

  return (
    <div className={`${isFirstTime ? "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm" : ""}`}>
      <div className="w-full max-w-lg bg-card border border-border rounded-xl shadow-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            <FolderOpen className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                {isFirstTime ? "Select Projects to Monitor" : "Change Projects"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isFirstTime
                  ? "Choose which Jira projects you want to monitor in Attention Tracker"
                  : "Select multiple projects to monitor"}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search projects..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent text-sm outline-none w-full text-foreground placeholder:text-muted-foreground"
              autoFocus
            />
          </div>
        </div>

        {/* Select All / Clear */}
        {!isLoading && !error && projects && projects.length > 0 && (
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/10">
            <span className="text-xs text-muted-foreground">
              {localSelected.size} of {projects.length} selected
            </span>
            <div className="flex gap-3">
              <button onClick={selectAll} className="text-xs text-primary hover:underline">Select all</button>
              <button onClick={clearAll} className="text-xs text-muted-foreground hover:underline">Clear</button>
            </div>
          </div>
        )}

        {/* Project List */}
        <div className="overflow-y-auto max-h-72">
          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading projects...
            </div>
          )}
          {error && (
            <div className="px-4 py-6 text-center space-y-3">
              <p className="text-sm text-critical font-medium">Failed to load projects</p>
              <p className="text-xs text-muted-foreground">{error.message}</p>
              <button
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 text-xs text-primary hover:underline"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </div>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No projects found matching "{search}"
            </div>
          )}
          {!isLoading && !error && filtered.map((project: JiraProject) => {
            const isSelected = localSelected.has(project.key);
            return (
              <button
                key={project.key}
                onClick={() => toggleProject(project.key)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors border-b border-border/50 last:border-0 ${isSelected ? "bg-primary/5" : ""}`}
              >
                <div className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                  isSelected ? "bg-primary border-primary" : "border-border"
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{project.key}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-border flex items-center justify-between bg-muted/10">
          {!isFirstTime && (
            <button
              onClick={onDone}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={localSelected.size === 0}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
              localSelected.size === 0
                ? "bg-muted text-muted-foreground cursor-not-allowed"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            } ${isFirstTime ? "ml-auto" : ""}`}
          >
            {isFirstTime ? "Start Monitoring" : "Save"}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
