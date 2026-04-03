import { useState, useCallback, useEffect } from "react";

export interface JiraConfig {
  instanceUrl: string;
  email: string;
  apiToken: string;
}

const STORAGE_KEY = "jira_config";
const API_BASE = "http://localhost:3001/api/jira";

export function useJiraConfig() {
  const [config, setConfig] = useState<JiraConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Load config from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setConfig(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load Jira config from localStorage:", error);
    }
  }, []);

  const saveConfig = useCallback(async (newConfig: JiraConfig) => {
    setIsLoading(true);
    try {
      // Send config to backend
      const response = await fetch(`${API_BASE}/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newConfig),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save config");
      }

      // Save to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
      setConfig(newConfig);
    } catch (error) {
      console.error("Failed to save Jira config:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      // Notify backend
      await fetch(`${API_BASE}/config`, {
        method: "DELETE",
      }).catch(() => {
        // Ignore errors on backend clear
      });

      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY);
      setConfig(null);
    } catch (error) {
      console.error("Failed to clear Jira config:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const testConnection = useCallback(async (testConfig: JiraConfig) => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(testConfig),
      });

      if (response.ok) {
        return true;
      } else {
        const error = await response.json();
        throw new Error(error.error || "Connection failed");
      }
    } catch (error) {
      console.error("Jira connection test failed:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    config,
    isLoading,
    saveConfig,
    clearConfig,
    testConnection,
  };
}

/**
 * Hook to make authenticated API calls to Jira via backend proxy
 * Returns a function that can be used to make requests to Jira API
 */
export function useJiraAPI() {
  const { config } = useJiraConfig();

  const request = useCallback(
    async <T,>(
      endpoint: string,
      options: RequestInit = {}
    ): Promise<T> => {
      if (!config) {
        throw new Error(
          "Jira configuration not found. Please configure Jira first."
        );
      }

      const url = `${API_BASE}/api${endpoint}`;

      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      if (!response.ok) {
        try {
          const errorData = await response.json();
          throw new Error(
            `Jira API Error: ${response.status} - ${errorData.error || response.statusText}`
          );
        } catch (e) {
          throw new Error(`Jira API Error: ${response.status} ${response.statusText}`);
        }
      }

      // Handle 204 No Content
      if (response.status === 204) {
        return null as T;
      }

      return response.json() as Promise<T>;
    },
    [config]
  );

  const get = useCallback(
    <T,>(endpoint: string) => request<T>(endpoint, { method: "GET" }),
    [request]
  );

  const post = useCallback(
    <T,>(endpoint: string, body: unknown) =>
      request<T>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    [request]
  );

  const put = useCallback(
    <T,>(endpoint: string, body: unknown) =>
      request<T>(endpoint, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    [request]
  );

  const patch = useCallback(
    <T,>(endpoint: string, body: unknown) =>
      request<T>(endpoint, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    [request]
  );

  const del = useCallback(
    <T,>(endpoint: string) => request<T>(endpoint, { method: "DELETE" }),
    [request]
  );

  return {
    request,
    get,
    post,
    put,
    patch,
    delete: del,
    isConfigured: !!config,
  };
}

/**
 * Hook for JQL-based issue search
 * Uses the new /rest/api/3/search/jql endpoint
 */
export function useJiraJQLSearch() {
  const { config } = useJiraConfig();

  const search = useCallback(
    async <T,>(
      jql: string,
      options: {
        maxResults?: number;
        startAt?: number;
        fields?: string[];
      } = {}
    ): Promise<T> => {
      if (!config) {
        throw new Error(
          "Jira configuration not found. Please configure Jira first."
        );
      }

      const { maxResults = 50, startAt = 0, fields = [] } = options;

      const response = await fetch(`${API_BASE}/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jql,
          maxResults,
          startAt,
          fields: fields.length > 0 ? fields : undefined,
        }),
      });

      if (!response.ok) {
        try {
          const errorData = await response.json();
          throw new Error(
            `JQL Search Error: ${response.status} - ${errorData.error || errorData.errorMessages?.join(", ") || response.statusText}`
          );
        } catch (e) {
          throw e instanceof Error
            ? e
            : new Error(`JQL Search Error: ${response.status} ${response.statusText}`);
        }
      }

      return response.json() as Promise<T>;
    },
    [config]
  );

  return {
    search,
    isConfigured: !!config,
  };
}
