import { useState, useCallback } from "react";

const STORAGE_KEY = "attention_selected_projects";

export interface SelectedProjectsState {
  projectKeys: string[];
  isConfigured: boolean; // true = user has explicitly selected projects
}

export function useSelectedProjects() {
  const [state, setState] = useState<SelectedProjectsState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { projectKeys: parsed, isConfigured: true };
        }
      }
    } catch {}
    return { projectKeys: [], isConfigured: false };
  });

  const setSelectedProjects = useCallback((keys: string[]) => {
    const newState: SelectedProjectsState = {
      projectKeys: keys,
      isConfigured: keys.length > 0,
    };
    setState(newState);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
    } catch {}
  }, []);

  const clearSelectedProjects = useCallback(() => {
    setState({ projectKeys: [], isConfigured: false });
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Build JQL project clause from selected keys (computed string, not function)
  const projectJQL =
    state.projectKeys.length === 0
      ? ""
      : state.projectKeys.length === 1
        ? `project = ${state.projectKeys[0]}`
        : `project IN (${state.projectKeys.join(", ")})`;

  return {
    selectedProjects: state.projectKeys,
    isConfigured: state.isConfigured,
    setSelectedProjects,
    clearSelectedProjects,
    projectJQL,
  };
}
