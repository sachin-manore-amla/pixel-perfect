import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config();

const app = express();
const PORT = process.env.VITE_API_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Store Jira config (in production, this would come from secure storage)
interface JiraConfig {
  instanceUrl: string;
  email: string;
  apiToken: string;
}

let jiraConfig: JiraConfig | null = null;

// Path to persist config across server restarts
const CONFIG_FILE = path.join(process.cwd(), ".jira-config.json");

function loadPersistedConfig(): JiraConfig | null {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed.instanceUrl && parsed.email && parsed.apiToken) {
        console.log("[INIT] Loaded Jira config from persisted file");
        return parsed as JiraConfig;
      }
    }
  } catch (e) {
    console.warn("[INIT] Could not read persisted Jira config:", e);
  }
  return null;
}

function savePersistedConfig(config: JiraConfig | null) {
  try {
    if (config) {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    } else {
      if (fs.existsSync(CONFIG_FILE)) fs.unlinkSync(CONFIG_FILE);
    }
  } catch (e) {
    console.warn("[INIT] Could not persist Jira config:", e);
  }
}

// Initialize JIRA config from persisted file or environment variables at startup
const initJiraConfig = () => {
  // 1. Try persisted config file first (saved from UI)
  const persisted = loadPersistedConfig();
  if (persisted) {
    jiraConfig = persisted;
    return;
  }

  // 2. Fall back to environment variables
  const instanceUrl = process.env.VITE_JIRA_API_URL;
  const email = process.env.VITE_JIRA_USERNAME;
  const apiToken = process.env.VITE_JIRA_PASSWORD;

  if (instanceUrl && email && apiToken) {
    jiraConfig = {
      instanceUrl: instanceUrl.replace(/\/$/, ""),
      email,
      apiToken,
    };
    console.log("[INIT] JIRA config initialized from environment variables");
  } else {
    console.warn("[INIT] JIRA credentials not found in environment variables or config file");
  }
};

// Initialize on startup
initJiraConfig();

// Middleware to validate Jira config
const requireJiraConfig = (req: Request, res: Response, next: NextFunction) => {
  if (!jiraConfig) {
    return res.status(400).json({
      error: "Jira configuration not found. Please configure Jira first.",
    });
  }
  next();
};

// Helper to make Jira API requests
async function makeJiraRequest(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<globalThis.Response> {
  if (!jiraConfig) {
    throw new Error("Jira configuration not found");
  }

  const url = `${jiraConfig.instanceUrl}/rest/api/3${endpoint}`;
  const authHeader = `Basic ${Buffer.from(
    `${jiraConfig.email}:${jiraConfig.apiToken}`
  ).toString("base64")}`;

  const options: RequestInit = {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return fetch(url, options);
}

/** Make a request to the Jira Agile API (/rest/agile/1.0) */
async function makeAgileRequest(method: string, endpoint: string): Promise<globalThis.Response> {
  if (!jiraConfig) throw new Error("Jira configuration not found");
  const url = `${jiraConfig.instanceUrl}/rest/agile/1.0${endpoint}`;
  const authHeader = `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString("base64")}`;
  return fetch(url, { method, headers: { Authorization: authHeader, "Content-Type": "application/json" } });
}

/**
 * POST /api/jira/config
 * Save Jira configuration
 */
app.post("/api/jira/config", (req: Request, res: Response) => {
  try {
    const { instanceUrl, email, apiToken } = req.body;

    if (!instanceUrl || !email || !apiToken) {
      return res.status(400).json({
        error: "Missing required fields: instanceUrl, email, apiToken",
      });
    }

    // Validate URL
    try {
      new URL(instanceUrl);
    } catch {
      return res.status(400).json({ error: "Invalid Jira instance URL" });
    }

    jiraConfig = {
      instanceUrl: instanceUrl.replace(/\/$/, ""),
      email,
      apiToken,
    };

    savePersistedConfig(jiraConfig);
    res.json({ success: true, message: "Jira config saved" });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to save config",
    });
  }
});

/**
 * POST /api/jira/test
 * Test Jira connection
 */
app.post("/api/jira/test", async (req: Request, res: Response) => {
  try {
    const { instanceUrl, email, apiToken } = req.body;

    if (!instanceUrl || !email || !apiToken) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const tempConfig = {
      instanceUrl,
      email,
      apiToken,
    };

    // Temporarily set config for this test
    const originalConfig = jiraConfig;
    jiraConfig = tempConfig;

    try {
      const response = await makeJiraRequest("GET", "/myself");
      const fetchResponse = response as globalThis.Response;

      if (fetchResponse.ok) {
        res.json({ success: true, message: "Connection successful" });
      } else {
        res.status(fetchResponse.status).json({
          success: false,
          error: `Jira API returned ${fetchResponse.status}`,
        });
      }
    } finally {
      // Restore original config
      jiraConfig = originalConfig;
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Connection test failed",
    });
  }
});

/**
 * DELETE /api/jira/config
 * Clear Jira configuration
 */
app.delete("/api/jira/config", (req: Request, res: Response) => {
  jiraConfig = null;
  savePersistedConfig(null);
  res.json({ success: true, message: "Jira config cleared" });
});

/**
 * GET /api/jira/config
 * Check if Jira is configured
 */
app.get("/api/jira/config", (req: Request, res: Response) => {
  if (jiraConfig) {
    res.json({
      configured: true,
      instanceUrl: jiraConfig.instanceUrl,
      email: jiraConfig.email,
    });
  } else {
    res.json({ configured: false });
  }
});

/**
 * GET /api/jira/api/*
 * Proxy GET requests to Jira API
 */
app.get("/api/jira/api/*", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    // Extract everything after /api/jira/api from the original URL
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY GET] Endpoint: ${endpoint}`);

    const response = await makeJiraRequest("GET", endpoint);
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    console.error("[PROXY ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Jira API request failed",
    });
  }
});

/**
 * POST /api/jira/api/*
 * Proxy POST requests to Jira API
 */
app.post("/api/jira/api/*", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY POST] Endpoint: ${endpoint}`);

    const response = await makeJiraRequest("POST", endpoint, req.body);
    const data = await response.json();

    res.status(response.status).json(data);
  } catch (error) {
    console.error("[PROXY ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Jira API request failed",
    });
  }
});

/**
 * PUT /api/jira/api/*
 * Proxy PUT requests to Jira API
 */
app.put("/api/jira/api/*", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY PUT] Endpoint: ${endpoint}`);

    const response = await makeJiraRequest("PUT", endpoint, req.body);

    if (response.status === 204) {
      res.status(204).send();
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error("[PROXY ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Jira API request failed",
    });
  }
});

/**
 * PATCH /api/jira/api/*
 * Proxy PATCH requests to Jira API
 */
app.patch("/api/jira/api/*", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY PATCH] Endpoint: ${endpoint}`);

    const response = await makeJiraRequest("PATCH", endpoint, req.body);

   if (response.status === 204) {
      res.status(204).send();
    } else {
      const data = await response.json();
      res.status(response.status).json(data);
    }
  } catch (error) {
    console.error("[PROXY ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Jira API request failed",
    });
  }
});

/**
 * DELETE /api/jira/api/*
 * Proxy DELETE requests to Jira API
 */
app.delete("/api/jira/api/*", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY DELETE] Endpoint: ${endpoint}`);

    const response = await makeJiraRequest("DELETE", endpoint);

    if ((response as any).status === 204) {
      res.status(204).send();
    } else {
      const data = await response.json();
      res.status((response as any).status).json(data);
    }
  } catch (error) {
    console.error("[PROXY ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Jira API request failed",
    });
  }
});

/**
 * POST /api/jira/search
 * Search issues using JQL (new /rest/api/3/search/jql endpoint)
 */
app.post("/api/jira/search", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const { jql, maxResults = 50, startAt = 0, fields } = req.body;

    if (!jql) {
      return res.status(400).json({ error: "JQL query is required" });
    }

    if (!jiraConfig) {
      return res.status(400).json({
        error: "Jira configuration not found. Please configure Jira first.",
      });
    }

    const url = new URL(`${jiraConfig.instanceUrl}/rest/api/3/search/jql`);
    url.searchParams.append("jql", jql);
    url.searchParams.append("maxResults", maxResults.toString());
    url.searchParams.append("startAt", startAt.toString());

    if (fields && Array.isArray(fields)) {
      url.searchParams.append("fields", fields.join(","));
    }

    const authHeader = `Basic ${Buffer.from(
      `${jiraConfig.email}:${jiraConfig.apiToken}`
    ).toString("base64")}`;

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[JQL SEARCH ERROR]", data);
    }

    res.status(response.status).json(data);
  } catch (error) {
    console.error("[JQL SEARCH ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "JQL search failed",
    });
  }
});

/**
 * GET /api/jira/watchers/:issueKey
 * Get watchers for a specific issue
 */
app.get("/api/jira/watchers/:issueKey", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const { issueKey } = req.params;
    if (!issueKey) {
      return res.status(400).json({ error: "Issue key is required" });
    }

    const response = await makeJiraRequest("GET", `/issue/${issueKey}/watchers`);
    const data = await response.json();

    res.status((response as any).status).json(data);
  } catch (error) {
    console.error("[WATCHERS ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch watchers",
    });
  }
});

/**
 * GET /api/jira/issue/:issueKey/comment
 * Get comments for a specific issue
 */
app.get("/api/jira/issue/:issueKey/comment", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const { issueKey } = req.params;
    
    if (!issueKey) {
      return res.status(400).json({ error: "Issue key is required" });
    }

    console.log(`[COMMENTS] Fetching comments for ${issueKey}`);

    const response = await makeJiraRequest("GET", `/issue/${issueKey}?fields=comment`);
    
    if (!response.ok) {
      throw new Error(`Jira API returned ${response.status}`);
    }

    const data = await response.json();
    const comments = data.fields?.comment || { comments: [] };
    
    console.log(`[COMMENTS] Found ${comments.comments?.length || 0} comments for ${issueKey}`);

    res.status(200).json(comments);
  } catch (error) {
    console.error("[COMMENTS ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch comments",
    });
  }
});

/**
 * GET /api/jira/current-user
 * Get current user information
 */
app.get("/api/jira/current-user", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const response = await makeJiraRequest("GET", `/myself`);
    const data = await response.json();

    res.status((response as any).status).json(data);
  } catch (error) {
    console.error("[CURRENT USER ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch current user",
    });
  }
});

/**
 * GET /api/jira/projects
 * Get all projects accessible by the current user
 */
app.get("/api/jira/projects", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    // Fetch all projects with pagination
    let allProjects: Array<{ id: string; key: string; name: string; projectTypeKey: string }> = [];
    let startAt = 0;
    const maxResults = 50;
    let isLast = false;

    while (!isLast) {
      const response = await makeJiraRequest(
        "GET",
        `/project/search?startAt=${startAt}&maxResults=${maxResults}&orderBy=name&expand=lead`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.status}`);
      }

      const data = await response.json() as any;
      const projects = data.values || [];
      allProjects = allProjects.concat(
        projects.map((p: any) => ({
          id: p.id,
          key: p.key,
          name: p.name,
          projectTypeKey: p.projectTypeKey || "software",
        }))
      );

      isLast = data.isLast ?? projects.length < maxResults;
      startAt += projects.length;
      if (projects.length === 0) break;
    }

    console.log(`[PROJECTS] Found ${allProjects.length} accessible projects`);
    res.json({ projects: allProjects, total: allProjects.length });
  } catch (error) {
    console.error("[PROJECTS ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to fetch projects",
    });
  }
});

/**
 * POST /api/jira/check-user-commented
 * Check if current user has commented on specific tickets
 */
app.post("/api/jira/check-user-commented", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const { issueKeys } = req.body;
    if (!issueKeys || !Array.isArray(issueKeys)) {
      return res.status(400).json({ error: "issueKeys array is required" });
    }

    // Get current user
    const userResponse = await makeJiraRequest("GET", `/myself`);
    const currentUser = await userResponse.json();
    const currentUserEmail = currentUser.emailAddress;

    // Check comments for each issue
    const results: { [key: string]: boolean } = {};

    for (const issueKey of issueKeys) {
      try {
        const commentsResponse = await makeJiraRequest("GET", `/issues/${issueKey}?fields=comment`);
        const issueData = await commentsResponse.json();
        
        if (issueData.fields && issueData.fields.comment) {
          const comments = issueData.fields.comment.comments || [];
          // Check if current user has any comments on this issue
          const hasCommented = comments.some(
            (comment: any) => comment.author.emailAddress === currentUserEmail
          );
          results[issueKey] = hasCommented;
        } else {
          results[issueKey] = false;
        }
      } catch (error) {
        console.error(`Error checking comments for ${issueKey}:`, error);
        results[issueKey] = false;
      }
    }

    res.json({ results });
  } catch (error) {
    console.error("[CHECK COMMENTED ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to check comments",
    });
  }
});

/**
 * POST /api/jira/check-watching
 * Check if current user is watching specific issues
 */
app.post("/api/jira/check-watching", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const { issueKeys } = req.body;
    if (!issueKeys || !Array.isArray(issueKeys)) {
      return res.status(400).json({ error: "issueKeys array is required" });
    }

    // Get current user
    const userResponse = await makeJiraRequest("GET", `/myself`);
    if (!userResponse.ok) {
      throw new Error("Failed to get current user");
    }
    const currentUser = await userResponse.json();

    // Check watchers for each issue
    const watchingStatus: { [key: string]: boolean } = {};
    
    for (const issueKey of issueKeys) {
      const watchersResponse = await makeJiraRequest("GET", `/issue/${issueKey}/watchers`);
      if (watchersResponse.ok) {
        const watchersData = await watchersResponse.json();
        const watchers = watchersData.watchers || [];
        // Check if current user is in watchers list
        watchingStatus[issueKey] = watchers.some((w: any) => w.accountId === (currentUser as any).accountId);
      } else {
        watchingStatus[issueKey] = false;
      }
    }

    res.json(watchingStatus);
  } catch (error) {
    console.error("[CHECK WATCHING ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to check watching status",
    });
  }
});

/**
 * POST /api/jira/watch-ticket
 * Add current user as watcher to an issue
 */
app.post("/api/jira/watch-ticket", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const { issueKey } = req.body;
    if (!issueKey) {
      return res.status(400).json({ error: "Issue key is required" });
    }

    // Get current user
    const userResponse = await makeJiraRequest("GET", `/myself`);
    if (!userResponse.ok) {
      throw new Error("Failed to get current user");
    }
    const currentUser = await userResponse.json();

    // Add current user as watcher
    const watchResponse = await makeJiraRequest("POST", `/issue/${issueKey}/watchers`, {
      accountId: (currentUser as any).accountId,
    });

    if (watchResponse.ok) {
      res.json({ success: true, message: `Now watching ${issueKey}` });
    } else {
      const errorData = await watchResponse.text();
      res.status(watchResponse.status).json({ 
        error: `Failed to watch ticket: ${errorData}` 
      });
    }
  } catch (error) {
    console.error("[WATCH TICKET ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Failed to watch ticket",
    });
  }
});

// ─── Comment Sync Feature ────────────────────────────────────────────────────

interface SyncRecord {
  id: string;
  sourceKey: string;
  targetKey: string;
  direction: "to-zlmc" | "to-z10";
  commentId: string;
  originalComment: string;
  transformedComment: string;
  author: string;
  timestamp: string;
  status: "success" | "failed";
  error?: string;
}

// ─── Persistent sync state ───────────────────────────────────────────────────
const SYNC_STATE_FILE = path.join(process.cwd(), ".sync-state.json");

interface SyncState {
  syncedIds: string[];     // "sourceKey::commentId" — secondary dedup
  history: SyncRecord[];
  lastSyncedAt: string | null;
}

function loadSyncState(): SyncState {
  try {
    if (fs.existsSync(SYNC_STATE_FILE)) {
      const raw = fs.readFileSync(SYNC_STATE_FILE, "utf-8");
      const parsed = JSON.parse(raw) as SyncState;
      console.log(`[SYNC STATE] Loaded ${parsed.syncedIds?.length ?? 0} synced IDs, lastSyncedAt=${parsed.lastSyncedAt}`);
      return {
        syncedIds: parsed.syncedIds || [],
        history: parsed.history || [],
        lastSyncedAt: parsed.lastSyncedAt || null,
      };
    }
  } catch (e) {
    console.warn("[SYNC STATE] Failed to load sync state, starting fresh:", e);
  }
  console.log("[SYNC STATE] First run — no prior sync history");
  return { syncedIds: [], history: [], lastSyncedAt: null };
}

function saveSyncState() {
  try {
    const state: SyncState = {
      syncedIds: Array.from(syncedCommentIds),
      history: syncHistory,
      lastSyncedAt,
    };
    fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (e) {
    console.warn("[SYNC STATE] Failed to save sync state:", e);
  }
}

// Bootstrap from disk
const _initialState = loadSyncState();
const syncHistory: SyncRecord[] = _initialState.history;
const syncedCommentIds = new Set<string>(_initialState.syncedIds);
let lastSyncedAt: string | null = _initialState.lastSyncedAt;

/** Register a record, update dedup + lastSyncedAt to now, and persist to disk */
function registerSyncRecord(record: SyncRecord) {
  syncHistory.unshift(record);
  if (record.status === "success" && record.commentId) {
    syncedCommentIds.add(`${record.sourceKey}::${record.commentId}`);
    // Advance the cutoff to the moment this sync ran
    lastSyncedAt = new Date().toISOString();
  }
  if (syncHistory.length > 500) syncHistory.pop();
  saveSyncState();
}

/** Check if a specific comment has already been successfully synced */
function isAlreadySynced(sourceKey: string, commentId: string): boolean {
  return syncedCommentIds.has(`${sourceKey}::${commentId}`);
}


/** Extract plain text from Jira ADF (Atlassian Document Format) or plain string */
function extractADFText(body: unknown): string {
  if (typeof body === "string") return body;
  // Also handle case where body is already serialised as JSON string
  if (typeof body === "object" && body !== null) {
    const adf = body as { content?: unknown[]; text?: string };
    // Flat text field (some Jira versions)
    if (typeof adf.text === "string") return adf.text;
    if (!adf.content) {
      // Last resort: stringify and search
      return JSON.stringify(body);
    }
    const texts: string[] = [];
    const walk = (nodes: unknown[]) => {
      for (const node of nodes as Array<{ type?: string; text?: string; attrs?: { text?: string }; content?: unknown[] }>) {
        if (node.type === "text" && node.text) texts.push(node.text);
        if (node.type === "mention" && node.attrs?.text) texts.push(node.attrs.text);
        if (node.content) walk(node.content);
      }
    };
    walk(adf.content);
    return texts.join("\n");
  }
  return String(body);
}

/** Extract all @mentioned display names from an ADF comment body */
/** Extract @mentioned display names from ADF */
function extractMentions(body: unknown): string[] {
  const mentions: string[] = [];
  if (typeof body !== "object" || body === null) return mentions;
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as Array<{ type?: string; attrs?: { text?: string }; content?: unknown[] }>) {
      if (node.type === "mention" && node.attrs?.text) {
        mentions.push(node.attrs.text.replace(/^@/, "").trim());
      }
      if (node.content) walk(node.content);
    }
  };
  const adf = body as { content?: unknown[] };
  if (adf.content) walk(adf.content);
  return mentions;
}

/** Extract accountIds of @mentioned users from ADF */
function extractMentionAccountIds(body: unknown): string[] {
  const ids: string[] = [];
  if (typeof body !== "object" || body === null) return ids;
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as Array<{ type?: string; attrs?: { id?: string }; content?: unknown[] }>) {
      if (node.type === "mention" && node.attrs?.id) ids.push(node.attrs.id);
      if (node.content) walk(node.content);
    }
  };
  const adf = body as { content?: unknown[] };
  if (adf.content) walk(adf.content);
  return ids;
}

// ─── ADF → HTML renderer ─────────────────────────────────────────────────────
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function renderADFNodes(nodes: unknown[]): string {
  return (nodes as unknown[]).map((n) => renderADFNode(n as Record<string, unknown>)).join("");
}

function renderADFNode(n: Record<string, unknown>): string {
  const type = n.type as string;
  const content = (n.content as unknown[] | undefined) || [];
  switch (type) {
    case "doc": return renderADFNodes(content);
    case "paragraph": return `<p>${renderADFNodes(content)}</p>`;
    case "heading": {
      const level = (n.attrs as Record<string, unknown>)?.level || 2;
      return `<h${level}>${renderADFNodes(content)}</h${level}>`;
    }
    case "bulletList": return `<ul>${renderADFNodes(content)}</ul>`;
    case "orderedList": return `<ol>${renderADFNodes(content)}</ol>`;
    case "listItem": return `<li>${renderADFNodes(content)}</li>`;
    case "blockquote": return `<blockquote>${renderADFNodes(content)}</blockquote>`;
    case "codeBlock": {
      const lang = (n.attrs as Record<string, unknown>)?.language || "";
      return `<pre><code class="language-${escHtml(String(lang))}">${renderADFNodes(content)}</code></pre>`;
    }
    case "rule": return `<hr />`;
    case "hardBreak": return `<br />`;
    case "text": {
      const marks = (n.marks as Array<Record<string, unknown>> | undefined) || [];
      let out = escHtml((n.text as string) || "");
      for (const mark of marks) {
        switch (mark.type) {
          case "strong": out = `<strong>${out}</strong>`; break;
          case "em": out = `<em>${out}</em>`; break;
          case "code": out = `<code>${out}</code>`; break;
          case "strike": out = `<s>${out}</s>`; break;
          case "underline": out = `<u>${out}</u>`; break;
          case "link": {
            const href = escHtml(String((mark.attrs as Record<string, unknown>)?.href || ""));
            out = `<a href="${href}" class="adf-link" target="_blank" rel="noopener noreferrer">${out}</a>`;
            break;
          }
        }
      }
      return out;
    }
    case "mention": {
      const text = escHtml(String((n.attrs as Record<string, unknown>)?.text || ""));
      return `<span class="adf-mention">${text}</span>`;
    }
    case "inlineCard": return ""; // suppress
    case "mediaSingle": return ""; // suppress images
    case "media": return "";
    default: return renderADFNodes(content);
  }
}

function extractADFHtml(body: unknown): string {
  if (typeof body === "string") return `<p>${escHtml(body)}</p>`;
  if (typeof body !== "object" || body === null) return "";
  return renderADFNode(body as Record<string, unknown>);
}

// ─── Board admin cache (15-min TTL) ─────────────────────────────────────────
let boardAdminMap = new Map<number, Set<string>>();
let boardNameMap = new Map<number, string>();
let boardCacheBuiltAt: number | null = null;
const BOARD_CACHE_TTL_MS = 15 * 60 * 1000;

function clearBoardAdminCache() {
  boardAdminMap = new Map();
  boardNameMap = new Map();
  boardCacheBuiltAt = null;
}

async function buildBoardAdminCache(projects: string[]): Promise<void> {
  if (boardCacheBuiltAt && Date.now() - boardCacheBuiltAt < BOARD_CACHE_TTL_MS) return;
  const newAdminMap = new Map<number, Set<string>>();
  const newNameMap = new Map<number, string>();
  await Promise.allSettled(
    projects.map(async (key) => {
      try {
        const res = await makeAgileRequest("GET", `/board?projectKeyOrId=${key}`);
        if (!res.ok) return;
        const data = await res.json() as { values?: Array<{ id: number; name: string }> };
        for (const board of data.values || []) {
          newNameMap.set(board.id, board.name);
          const detailRes = await makeAgileRequest("GET", `/board/${board.id}`);
          if (!detailRes.ok) continue;
          const detail = await detailRes.json() as { admins?: { users?: Array<{ accountId: string }> } };
          const adminIds = new Set((detail.admins?.users || []).map((u) => u.accountId));
          newAdminMap.set(board.id, adminIds);
        }
      } catch {}
    })
  );
  boardAdminMap = newAdminMap;
  boardNameMap = newNameMap;
  boardCacheBuiltAt = Date.now();
}

/** Extract media node count + external links from ADF body */
function extractCommentMediaInfo(body: unknown): { mediaCount: number; links: string[] } {
  let mediaCount = 0;
  const links: string[] = [];
  if (typeof body !== "object" || body === null) return { mediaCount, links };
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as Array<Record<string, unknown>>) {
      if (node.type === "media") mediaCount++;
      if (node.type === "inlineCard") {
        const url = (node.attrs as Record<string, unknown>)?.url;
        if (typeof url === "string") links.push(url);
      }
      if (node.type === "text") {
        const marks = (node.marks as Array<Record<string, unknown>> | undefined) || [];
        for (const m of marks) {
          if (m.type === "link") {
            const href = (m.attrs as Record<string, unknown>)?.href;
            if (typeof href === "string" && href.startsWith("http")) links.push(href);
          }
        }
      }
      if (node.content) walk(node.content as unknown[]);
    }
  };
  const adfBody = body as { content?: unknown[] };
  if (adfBody.content) walk(adfBody.content);
  return { mediaCount, links };
}

/** Fix media collection IDs so inline images render on the destination ticket */
function remapMediaCollections(node: unknown, destIssueId: string): unknown {
  if (typeof node !== "object" || node === null) return node;
  if (Array.isArray(node)) return (node as unknown[]).map((n) => remapMediaCollections(n, destIssueId));
  const n = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) {
    if (k === "attrs" && typeof v === "object" && v !== null) {
      const attrs = v as Record<string, unknown>;
      result[k] = { ...attrs, ...(attrs.collection ? { collection: `MediaServicesSample__${destIssueId}` } : {}) };
    } else if (k === "content" && Array.isArray(v)) {
      result[k] = (v as unknown[]).map((child) => remapMediaCollections(child, destIssueId));
    } else {
      result[k] = v;
    }
  }
  return result;
}

/** Fire-and-forget: copy source attachments to destination ticket */
async function copyAttachmentsToDestination(
  _sourceKey: string,
  destKey: string,
  attachments: Array<{ id: string; filename: string; mimeType: string }>
): Promise<void> {
  if (!jiraConfig || attachments.length === 0) return;
  const authHeader = `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString("base64")}`;
  for (const att of attachments) {
    try {
      const downloadRes = await fetch(`${jiraConfig.instanceUrl}/rest/api/3/attachment/content/${att.id}`, {
        headers: { Authorization: authHeader },
      });
      if (!downloadRes.ok) continue;
      const buffer = await downloadRes.arrayBuffer();
      const formData = new FormData();
      formData.append("file", new Blob([buffer], { type: att.mimeType }), att.filename);
      await fetch(`${jiraConfig.instanceUrl}/rest/api/3/issue/${destKey}/attachments`, {
        method: "POST",
        headers: { Authorization: authHeader, "X-Atlassian-Token": "no-check" },
        body: formData,
      });
    } catch {}
  }
}

/** Strip #update hashtag text nodes from ADF before posting to destination */
function removeHashtagFromADF(node: unknown): unknown {
  if (typeof node !== "object" || node === null) return node;
  if (Array.isArray(node)) return (node as unknown[]).map((n) => removeHashtagFromADF(n)).filter(Boolean);
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") {
    const cleaned = (n.text as string).replace(/#update\b/gi, "").replace(/\s{2,}/g, " ").trim();
    if (!cleaned) return null;
    return { ...n, text: cleaned };
  }
  if (n.content && Array.isArray(n.content)) {
    return { ...n, content: (n.content as unknown[]).map((c) => removeHashtagFromADF(c)).filter(Boolean) };
  }
  return n;
}

/** Use OpenAI to rewrite a comment for the target audience */
async function transformCommentWithAI(
  commentBody: string,
  direction: "to-zlmc" | "to-z10",
  ticketSummary: string
): Promise<string> {
  const openaiApiKey =
    process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;

  // Clean up hashtag regardless
  const cleaned = commentBody
    .replace(/#updateforzlmc/gi, "")
    .replace(/#updateforz10/gi, "")
    .trim();

  if (!openaiApiKey || openaiApiKey.startsWith("sk-test")) {
    // Fallback: return cleaned comment with a sync note
    const note =
      direction === "to-zlmc"
        ? "\n\n[Synced by JiraTriage from Z10 ticket]"
        : "\n\n[Synced by JiraTriage from ZLMC ticket]";
    return cleaned + note;
  }

  const systemPrompt =
    direction === "to-zlmc"
      ? `You are helping sync internal engineering comments to a client-facing Jira board (ZLMC).
Rewrite the comment below to be professional, clear, and client-friendly.
Rules:
- Remove internal jargon, team names, internal tool references, and developer-only details.
- Focus on: what was done, current status, and any action needed from the client.
- Do NOT include the hashtag #updateforzlmc in the output.
- Write in a professional, reassuring tone.
- Keep it concise (max 3–4 sentences unless the original requires more detail).`
      : `You are helping sync a client comment from ZLMC to an internal engineering Jira board (Z10).
Rewrite the comment below to be useful for the internal engineering team.
Rules:
- Preserve all client-reported details and reproduction steps.
- Prefix with: "[Synced from ZLMC client ticket]"
- Do NOT include the hashtag #updateforz10 in the output.
- Keep it factual and actionable for engineers.`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Ticket summary: ${ticketSummary}\n\nComment:\n${cleaned}`,
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || cleaned;
  } catch (err) {
    console.error("[AI TRANSFORM ERROR]", err);
    return cleaned;
  }
}

/**
 * Core sync logic — shared between single and bulk sync endpoints.
 */
async function internalSyncComment(
  issueKey: string,
  commentBody: string,
  commentId: string,
  author: string
): Promise<SyncRecord> {
  // Direction is determined by source project — no hashtag ambiguity
  const isFromZLMC = /^Z10LMC-/i.test(issueKey);
  const direction = isFromZLMC ? "to-z10" : "to-zlmc";

  console.log(`[SYNC] Fetching issue ${issueKey} + raw comment body`);
  const [issueRes, commentRes] = await Promise.all([
    makeJiraRequest("GET", `/issue/${issueKey}?fields=summary,issuelinks,attachment`),
    commentId ? makeJiraRequest("GET", `/issue/${issueKey}/comment/${commentId}`) : Promise.resolve(null),
  ]);
  if (!issueRes.ok) throw new Error(`Failed to fetch issue ${issueKey} (${issueRes.status})`);
  const issueData = await issueRes.json();
  const issueAttachments: Array<{ id: string; filename: string; mimeType: string }> = issueData.fields?.attachment || [];

  // Get raw ADF body
  let rawADFBody: unknown = null;
  if (commentRes && commentRes.ok) {
    const cd = await commentRes.json();
    rawADFBody = cd.body || null;
  }

  // Find the clone-linked ticket — any project, just must be a "clones"/"is cloned by" link
  const links: Array<{
    type?: { name?: string; inward?: string; outward?: string };
    outwardIssue?: { key: string };
    inwardIssue?: { key: string };
  }> = issueData.fields?.issuelinks || [];
  let linkedKey: string | null = null;
  for (const link of links) {
    const typeName = (link.type?.name || "").toLowerCase();
    const inward = (link.type?.inward || "").toLowerCase();
    const outward = (link.type?.outward || "").toLowerCase();
    const isCloneLink =
      typeName.includes("clone") ||
      inward.includes("clone") ||
      outward.includes("clone");
    if (!isCloneLink) continue;
    const candidate = link.outwardIssue?.key || link.inwardIssue?.key;
    if (candidate) { linkedKey = candidate; break; }
  }
  if (!linkedKey) {
    throw new Error(`No "clones"/"is cloned by" link found on ${issueKey}. Ensure a clone link exists in Jira.`);
  }

  // Fetch destination issue to get reporter + last commenter for @mention notification
  const destRes = await makeJiraRequest("GET", `/issue/${linkedKey}?fields=reporter,comment`);
  const destData = destRes.ok ? await destRes.json() : null;
  const destReporter = destData?.fields?.reporter as { accountId?: string; displayName?: string } | null;
  const destComments: unknown[] = destData?.fields?.comment?.comments || [];
  const lastCommenter = destComments.length > 0
    ? (destComments[destComments.length - 1] as { author?: { accountId?: string; displayName?: string } }).author
    : null;

  // Build notification paragraph with @mentions
  const mentionNodes: unknown[] = [];
  const seen = new Set<string>();
  const addMention = (accountId?: string, displayName?: string) => {
    if (!accountId || seen.has(accountId)) return;
    seen.add(accountId);
    if (mentionNodes.length > 0) mentionNodes.push({ type: "text", text: " " });
    mentionNodes.push({ type: "mention", attrs: { id: accountId, text: `@${displayName || accountId}` } });
  };
  addMention(destReporter?.accountId, destReporter?.displayName);
  addMention(lastCommenter?.accountId, lastCommenter?.displayName);

  const notifParagraph = mentionNodes.length > 0
    ? [{ type: "paragraph", content: [{ type: "text", text: "FYI: " }, ...mentionNodes, { type: "text", text: ` — update from ${issueKey}:` }] }]
    : [];

  // Build body content: strip #update from original ADF, remap media collections
  let bodyContent: unknown[];
  if (rawADFBody && typeof rawADFBody === "object" && (rawADFBody as Record<string, unknown>).type === "doc") {
    const cleaned = removeHashtagFromADF(rawADFBody) as Record<string, unknown>;
    const remapped = remapMediaCollections(cleaned, linkedKey) as Record<string, unknown>;
    bodyContent = (remapped.content as unknown[]) || [];
  } else {
    const cleaned = commentBody.replace(/#update\b/gi, "").trim();
    bodyContent = [{ type: "paragraph", content: [{ type: "text", text: cleaned }] }];
  }

  const attributionParagraph = {
    type: "paragraph",
    content: [{ type: "text", text: `Posted by JiraTriage · ${issueKey}`, marks: [{ type: "em" }] }],
  };

  const postRes = await makeJiraRequest("POST", `/issue/${linkedKey}/comment`, {
    body: { type: "doc", version: 1, content: [...notifParagraph, ...bodyContent, attributionParagraph] },
  });
  const postData = await postRes.json();

  // Fire-and-forget attachment copy
  if (postRes.ok && issueAttachments.length > 0) {
    copyAttachmentsToDestination(issueKey, linkedKey, issueAttachments).catch(() => {});
  }

  const record: SyncRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceKey: issueKey,
    targetKey: linkedKey,
    direction,
    commentId,
    originalComment: commentBody,
    transformedComment: commentBody,
    author,
    timestamp: new Date().toISOString(),
    status: postRes.ok ? "success" : "failed",
    error: postRes.ok ? undefined : JSON.stringify(postData),
  };

  registerSyncRecord(record);
  console.log(`[SYNC] ${record.status.toUpperCase()} — ${issueKey} → ${linkedKey}`);
  return record;
}

/**
 * POST /api/jira/sync-comment
 * Sync a single comment to its linked ticket.
 */
app.post(
  "/api/jira/sync-comment",
  requireJiraConfig,
  async (req: Request, res: Response) => {
    try {
      const { issueKey, commentBody, commentId = "", author = "Unknown" } = req.body;

      if (!issueKey || !commentBody) {
        return res.status(400).json({ error: "issueKey and commentBody are required" });
      }

      if (!/#update\b/i.test(commentBody)) {
        return res.status(400).json({ error: "No #update hashtag found in comment" });
      }

      // Dedup by commentId
      if (commentId && isAlreadySynced(issueKey, commentId)) {
        return res.status(409).json({ error: "This comment has already been synced.", alreadySynced: true });
      }

      const record = await internalSyncComment(issueKey, commentBody, commentId, author);
      res.json({ success: record.status === "success", targetKey: record.targetKey, transformedComment: record.transformedComment, record });
    } catch (error) {
      console.error("[SYNC COMMENT ERROR]", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Comment sync failed" });
    }
  }
);

/**
 * POST /api/jira/sync-all
 * Bulk-sync multiple pending comments in one request.
 * Body: { comments: Array<{ issueKey, commentBody, commentId, author? }> }
 */
app.post(
  "/api/jira/sync-all",
  requireJiraConfig,
  async (req: Request, res: Response) => {
    try {
      const { comments } = req.body;
      if (!Array.isArray(comments) || comments.length === 0) {
        return res.status(400).json({ error: "comments array is required" });
      }

      const results: Array<{
        issueKey: string;
        commentId: string;
        status: string;
        targetKey?: string;
        error?: string;
        record?: SyncRecord;
      }> = [];

      for (const c of comments) {
        const { issueKey, commentBody, commentId = "", author = "Unknown" } = c;

        if (commentId && isAlreadySynced(issueKey, commentId)) {
          results.push({ issueKey, commentId, status: "skipped", error: "Already synced" });
          continue;
        }

        try {
          const record = await internalSyncComment(issueKey, commentBody, commentId, author);
          results.push({ issueKey, commentId, status: record.status, targetKey: record.targetKey, record });
        } catch (error) {
          results.push({
            issueKey,
            commentId,
            status: "failed",
            error: error instanceof Error ? error.message : "Sync failed",
          });
        }
      }

      const succeeded = results.filter((r) => r.status === "success").length;
      const skipped = results.filter((r) => r.status === "skipped").length;
      const failed = results.filter((r) => r.status === "failed").length;

      res.json({ results, summary: { total: comments.length, succeeded, skipped, failed } });
    } catch (error) {
      console.error("[SYNC ALL ERROR]", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Bulk sync failed" });
    }
  }
);

/**
 * Run tasks with a max concurrency cap.
 */
async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency = 10
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const item = items[idx++];
      try { await fn(item); } catch { /* individual errors handled inside fn */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

/**
 * POST /api/jira/auto-discover
 * JQL-scan both Z10 and Z10LMC for comments with sync hashtags.
 * Optimized: smart JQL window based on lastSyncedAt + parallel comment fetching.
 * Body: { days?: number (default 1), maxIssues?: number (default 200) }
 */
app.post(
  "/api/jira/auto-discover",
  requireJiraConfig,
  async (req: Request, res: Response) => {
    try {
      const { days = 1, maxIssues = 200, projectKeys = [] } = req.body || {};
      const projects: string[] = Array.isArray(projectKeys) && projectKeys.length > 0
        ? projectKeys
        : ["Z10", "Z10LMC"]; // fallback if none provided

      if (!jiraConfig) return res.status(400).json({ error: "Jira not configured" });

      const authHeader = `Basic ${Buffer.from(
        `${jiraConfig.email}:${jiraConfig.apiToken}`
      ).toString("base64")}`;

      // Compute JQL window: use lastSyncedAt for tight filtering when available,
      // otherwise fall back to the `days` param.
      let updatedFilter: string;
      if (lastSyncedAt) {
        const msSince = Date.now() - new Date(lastSyncedAt).getTime();
        const daysSince = Math.ceil(msSince / 86_400_000) + 1; // +1 buffer
        updatedFilter = `-${Math.min(daysSince, days)}d`;
      } else {
        updatedFilter = `-${days}d`;
      }

      // One JQL query per selected project
      const jqlQueries = projects.map(
        (p: string) => `project = ${p} AND updated >= "${updatedFilter}" ORDER BY updated DESC`
      );

      // Fetch both project ticket lists in parallel
      const allIssueKeys: string[] = [];
      await Promise.allSettled(
        jqlQueries.map(async (jql) => {
          try {
            const url = new URL(`${jiraConfig!.instanceUrl}/rest/api/3/search/jql`);
            url.searchParams.append("jql", jql);
            url.searchParams.append("maxResults", String(maxIssues));
            url.searchParams.append("fields", "key");

            const searchRes = await fetch(url.toString(), {
              method: "GET",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
            });
            if (!searchRes.ok) {
              console.warn(`[AUTO-DISCOVER] JQL failed: ${jql}`);
              return;
            }
            const data = (await searchRes.json()) as { issues?: Array<{ key: string }> };
            const keys = (data.issues || []).map((i) => i.key);
            allIssueKeys.push(...keys);
          } catch (e) {
            console.error("[AUTO-DISCOVER] JQL error:", e);
          }
        })
      );

      // Deduplicate keys (a ticket could appear in both queries theoretically)
      const uniqueKeys = [...new Set(allIssueKeys)];
      console.log(`[AUTO-DISCOVER] Scanning ${uniqueKeys.length} tickets (window: ${updatedFilter})`);

      // Get current user + board admin cache in parallel
      let currentUserAccountId = "";
      await Promise.allSettled([
        makeJiraRequest("GET", "/myself").then(async (r) => {
          if (r.ok) { const d = await r.json(); currentUserAccountId = d.accountId || ""; }
        }),
        buildBoardAdminCache(projects),
      ]);

      const results: Array<{
        issueKey: string;
        commentId: string;
        commentBody: string;
        commentBodyHtml: string;
        author: string;
        authorAccountId: string;
        created: string;
        direction: string;
        mentions: string[];
        authorizedToPost: boolean;
        boardId: number | null;
        boardName: string;
        attachmentCount: number;
        attachments: Array<{ name: string; url: string | null }>;
        externalLinkCount: number;
        externalLinks: string[];
      }> = [];

      // Fetch comments for all tickets in parallel (10 at a time)
      await runConcurrent(
        uniqueKeys,
        async (key) => {
          const commentsRes = await makeJiraRequest("GET", `/issue/${key}?fields=comment,sprint,attachment`);
          if (!commentsRes.ok) return;
          const data = await commentsRes.json();

          // Determine board for this issue via sprint field
          const sprintFieldKey = Object.keys(data.fields || {}).find((k) =>
            Array.isArray(data.fields[k]) && data.fields[k][0]?.boardId
          );
          const issueBoardId: number | null = sprintFieldKey
            ? (data.fields[sprintFieldKey][0]?.boardId ?? null)
            : null;
          const issueBoardName: string = issueBoardId ? (boardNameMap.get(issueBoardId) || "") : "";
          const issueAttachments: Array<{ id: string; filename: string; mimeType: string; created: string }> =
            data.fields?.attachment || [];
          const filenameToAtt = new Map(issueAttachments.map((a) => [a.filename.toLowerCase(), a]));
          const boardAdmins = issueBoardId ? boardAdminMap.get(issueBoardId) : undefined;

          const comments: Array<{
            id: string;
            body: unknown;
            author?: { displayName?: string; accountId?: string };
            created: string;
          }> = data.fields?.comment?.comments || [];

          for (const c of comments) {
            const text = extractADFText(c.body);
            const isUpdate = /#update\b/i.test(text);
            if (!isUpdate) continue;
            if (isAlreadySynced(key, c.id)) continue;

            const isAuthor = c.author?.accountId === currentUserAccountId;
            const isMentioned = extractMentionAccountIds(c.body).includes(currentUserAccountId);
            let authorizedToPost: boolean;
            if (isAuthor) authorizedToPost = true;
            else if (isMentioned) authorizedToPost = true;
            else if (boardAdminMap.size === 0) authorizedToPost = true;
            else if (issueBoardId !== null) authorizedToPost = boardAdmins?.has(currentUserAccountId) ?? false;
            else authorizedToPost = false;

            const { mediaCount, links } = extractCommentMediaInfo(c.body);
            const commentAttachments: Array<{ name: string; url: string | null }> = [];
            const commentTime = new Date(c.created).getTime();
            let mediaIdx = 0;
            for (const att of issueAttachments) {
              if (mediaIdx >= mediaCount) break;
              const byName = filenameToAtt.has(att.filename.toLowerCase());
              const byTime = Math.abs(new Date(att.created).getTime() - commentTime) < 60_000;
              if (byName || byTime) {
                commentAttachments.push({
                  name: att.filename,
                  url: `${jiraConfig!.instanceUrl}/secure/attachment/${att.id}/${encodeURIComponent(att.filename)}`,
                });
                mediaIdx++;
              }
            }

            results.push({
              issueKey: key,
              commentId: c.id,
              commentBody: text,
              commentBodyHtml: extractADFHtml(c.body),
              author: c.author?.displayName || "Unknown",
              authorAccountId: c.author?.accountId || "",
              created: c.created,
              direction: /^Z10LMC-/i.test(key) ? "to-z10" : "to-zlmc",
              mentions: extractMentions(c.body),
              authorizedToPost,
              boardId: issueBoardId,
              boardName: issueBoardName,
              attachmentCount: commentAttachments.length,
              attachments: commentAttachments,
              externalLinkCount: links.length,
              externalLinks: links,
            });
          }
        },
        10
      );

      console.log(`[AUTO-DISCOVER] Found ${results.length} pending sync comments`);
      res.json({ results, scanned: uniqueKeys.length });
    } catch (error) {
      console.error("[AUTO-DISCOVER ERROR]", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Auto-discover failed" });
    }
  }
);

/**
 * POST /api/jira/poll-sync-comments
 * Scan a specific list of issue keys for comments containing sync hashtags.
 * Body: { issueKeys: string[] }
 * No date filter — dedup by commentId prevents re-syncing.
 */
app.post(
  "/api/jira/poll-sync-comments",
  requireJiraConfig,
  async (req: Request, res: Response) => {
    try {
      const { issueKeys } = req.body;
      if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
        return res.status(400).json({ error: "issueKeys array is required" });
      }

      // Get current user + board admin cache in parallel
      let pollCurrentUserAccountId = "";
      const pollProjects = [...new Set(issueKeys.map((k: string) => k.replace(/-\d+$/, "")))]; 
      await Promise.allSettled([
        makeJiraRequest("GET", "/myself").then(async (r) => {
          if (r.ok) { const d = await r.json(); pollCurrentUserAccountId = d.accountId || ""; }
        }),
        buildBoardAdminCache(pollProjects),
      ]);

      const results: Array<{
        issueKey: string;
        commentId: string;
        commentBody: string;
        commentBodyHtml: string;
        author: string;
        authorAccountId: string;
        created: string;
        direction: string;
        mentions: string[];
        authorizedToPost: boolean;
        boardId: number | null;
        boardName: string;
        attachmentCount: number;
        attachments: Array<{ name: string; url: string | null }>;
        externalLinkCount: number;
        externalLinks: string[];
      }> = [];

      for (const key of issueKeys) {
        try {
          const commentsRes = await makeJiraRequest("GET", `/issue/${key}?fields=comment,sprint,attachment`);
          if (!commentsRes.ok) continue;
          const data = await commentsRes.json();

          const sprintFieldKey = Object.keys(data.fields || {}).find((k) =>
            Array.isArray(data.fields[k]) && data.fields[k][0]?.boardId
          );
          const issueBoardId: number | null = sprintFieldKey
            ? (data.fields[sprintFieldKey][0]?.boardId ?? null)
            : null;
          const issueBoardName: string = issueBoardId ? (boardNameMap.get(issueBoardId) || "") : "";
          const issueAttachments: Array<{ id: string; filename: string; mimeType: string; created: string }> =
            data.fields?.attachment || [];
          const filenameToAtt = new Map(issueAttachments.map((a) => [a.filename.toLowerCase(), a]));
          const boardAdmins = issueBoardId ? boardAdminMap.get(issueBoardId) : undefined;

          const comments: Array<{
            id: string;
            body: unknown;
            author?: { displayName?: string; accountId?: string };
            created: string;
          }> = data.fields?.comment?.comments || [];

          for (const c of comments) {
            const text = extractADFText(c.body);
            const isUpdate = /#update\b/i.test(text);
            console.log(`[POLL] ${key} comment ${c.id} — text: "${text.slice(0, 150)}" | isUpdate=${isUpdate}`);
            if (!isUpdate) continue;
            if (isAlreadySynced(key, c.id)) {
              console.log(`[POLL] Skipping ${key}::${c.id} — already synced`);
              continue;
            }

            const isAuthor = c.author?.accountId === pollCurrentUserAccountId;
            const isMentioned = extractMentionAccountIds(c.body).includes(pollCurrentUserAccountId);
            let authorizedToPost: boolean;
            if (isAuthor) authorizedToPost = true;
            else if (isMentioned) authorizedToPost = true;
            else if (boardAdminMap.size === 0) authorizedToPost = true;
            else if (issueBoardId !== null) authorizedToPost = boardAdmins?.has(pollCurrentUserAccountId) ?? false;
            else authorizedToPost = false;

            const { mediaCount, links } = extractCommentMediaInfo(c.body);
            const commentAttachments: Array<{ name: string; url: string | null }> = [];
            const commentTime = new Date(c.created).getTime();
            let mediaIdx = 0;
            for (const att of issueAttachments) {
              if (mediaIdx >= mediaCount) break;
              const byName = filenameToAtt.has(att.filename.toLowerCase());
              const byTime = Math.abs(new Date(att.created).getTime() - commentTime) < 60_000;
              if (byName || byTime) {
                commentAttachments.push({
                  name: att.filename,
                  url: `${jiraConfig!.instanceUrl}/secure/attachment/${att.id}/${encodeURIComponent(att.filename)}`,
                });
                mediaIdx++;
              }
            }

            results.push({
              issueKey: key,
              commentId: c.id,
              commentBody: text,
              commentBodyHtml: extractADFHtml(c.body),
              author: c.author?.displayName || "Unknown",
              authorAccountId: c.author?.accountId || "",
              created: c.created,
              direction: /^Z10LMC-/i.test(key) ? "to-z10" : "to-zlmc",
              mentions: extractMentions(c.body),
              authorizedToPost,
              boardId: issueBoardId,
              boardName: issueBoardName,
              attachmentCount: commentAttachments.length,
              attachments: commentAttachments,
              externalLinkCount: links.length,
              externalLinks: links,
            });
          }
        } catch (e) {
          console.error(`[POLL] Error scanning ${key}:`, e);
        }
      }

      res.json({ results, scanned: issueKeys.length });
    } catch (error) {
      console.error("[POLL SYNC ERROR]", error);
      res.status(500).json({ error: error instanceof Error ? error.message : "Poll failed" });
    }
  }
);

/**
 * GET /api/jira/sync-history
 * Return the in-memory sync history.
 */
app.get("/api/jira/sync-history", requireJiraConfig, (req: Request, res: Response) => {
  res.json({ history: syncHistory, total: syncHistory.length });
});

/**
 * GET /api/jira/current-user
 * Returns the display name and email of the logged-in Jira user.
 */
app.get("/api/jira/current-user", requireJiraConfig, async (req: Request, res: Response) => {
  try {
    const response = await makeJiraRequest("GET", "/myself");
    const data = await response.json();
    res.json({
      displayName: data.displayName || "",
      email: data.emailAddress || "",
      accountId: data.accountId || "",
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch current user" });
  }
});

/**
 * POST /api/ai/analyze-comments
 * Use Gemini to analyze Jira ticket comments and determine if user attention is needed.
 * Falls back to keyword analysis. BOTH results are OR'd — nothing is missed.
 * Body: { ticketKey, ticketSummary, comments: Array<{author, text}>, mentionedUser? }
 */
app.post("/api/ai/analyze-comments", async (req: Request, res: Response) => {
  try {
    const { ticketKey, ticketSummary, comments, mentionedUser } = req.body;

    if (!comments || comments.length === 0) {
      return res.json({ needsAttention: false, reason: "", priority: "LOW" });
    }

    // ── Keyword check (always runs — safety net) ──────────────────────────────
    const keywordPatterns = {
      questions: ["?"],
      blockers: ["blocking", "blocked", "blocker", "stuck", "cannot proceed", "can't proceed", "production down", "outage"],
      urgent: ["urgent", "asap", "escalate", "escalation", "critical", "sev1"],
      unresolved: ["unresolved", "no response", "no update", "waiting for", "pending approval"],
      actionRequest: ["please", "can you", "could you", "would you", "let us know", "need your", "your input", "your thoughts", "please check", "please confirm", "please review", "please help", "please share", "please provide"],
    };
    const recentComments = (comments as Array<{author: string; text: string}>).slice(-3);
    let kwQuestion = false, kwBlocker = false, kwActionRequest = false, kwUnresolved = false, kwUrgent = false;
    for (const c of recentComments) {
      const t = c.text.toLowerCase();
      if (keywordPatterns.questions.some(k => t.includes(k))) kwQuestion = true;
      if (keywordPatterns.blockers.some(k => t.includes(k))) kwBlocker = true;
      if (keywordPatterns.urgent.some(k => t.includes(k))) kwUrgent = true;
      if (keywordPatterns.unresolved.some(k => t.includes(k))) kwUnresolved = true;
      if (keywordPatterns.actionRequest.some(k => t.includes(k))) kwActionRequest = true;
    }
    const keywordNeedsAttention = kwQuestion || kwBlocker || kwUnresolved || kwActionRequest;
    let keywordReason = "";
    if (kwBlocker) keywordReason = "Blocking issue detected in comments";
    else if (kwQuestion && kwActionRequest) keywordReason = "Direct question with action request in comments";
    else if (kwQuestion) keywordReason = "Unanswered question in recent comments";
    else if (kwActionRequest) keywordReason = "Action or input requested in recent comments";
    else if (kwUnresolved) keywordReason = "Unresolved item pending in comments";
    const keywordPriority = kwBlocker ? "HIGH" : (kwUrgent ? "HIGH" : "MEDIUM");

    // ── Gemini AI check ───────────────────────────────────────────────────────
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      console.log(`[AI ANALYZE] ${ticketKey}: No GEMINI_API_KEY — using keyword only. needsAttention=${keywordNeedsAttention}`);
      return res.json({
        needsAttention: keywordNeedsAttention,
        reason: keywordReason,
        priority: keywordPriority,
      });
    }

    const commentThread = (comments as Array<{author: string; text: string}>)
      .slice(-10)
      .map(c => `[${c.author}]: ${c.text}`)
      .join("\n");

    const mentionContext = mentionedUser
      ? `\nContext: "${mentionedUser}" was @mentioned. Set needsAttention=true if ACTIONABLE — direct question, request for input/update, blocker to resolve, approval needed. Set false ONLY for passive FYI/CC mentions with no action expected.`
      : "";

    const prompt = `You are a Jira P1 triage assistant.\n\nTicket: ${ticketKey}\nSummary: ${ticketSummary}${mentionContext}\n\nRecent Comments:\n${commentThread}\n\nDoes the mentioned user need to take action?\n- true: direct question, blocker, approval needed, explicit ask for input/update\n- false: FYI mention, status update only, no clear ask\n\nPriority: HIGH (production/customers impacted), MEDIUM (unanswered question, waiting for approval), LOW (routine)\nReason: max 100 chars\n\nRespond ONLY with valid JSON — no markdown, no explanation:\n{"needsAttention": true, "priority": "MEDIUM", "reason": "Question asked about deployment status"}`;

    let geminiNeedsAttention = false;
    let geminiReason = "";
    let geminiPriority: string = "LOW";

    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
          }),
        }
      );

      if (geminiRes.ok) {
        const geminiData = await geminiRes.json() as any;
        const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          geminiNeedsAttention = parsed.needsAttention === true;
          geminiReason = parsed.reason || "";
          geminiPriority = parsed.priority || "LOW";
          console.log(`[GEMINI] ${ticketKey}: needsAttention=${geminiNeedsAttention}, reason=${geminiReason}`);
        } else {
          console.warn(`[GEMINI] ${ticketKey}: Could not parse JSON from response:`, rawText);
        }
      } else {
        const errText = await geminiRes.text();
        console.error(`[GEMINI ERROR] ${ticketKey}: ${geminiRes.status} — ${errText}`);
      }
    } catch (geminiErr) {
      console.error(`[GEMINI ERROR] ${ticketKey}:`, geminiErr);
    }

    // ── OR logic: if EITHER Gemini OR keyword detects action needed → show ticket ──
    const finalNeedsAttention = geminiNeedsAttention || keywordNeedsAttention;
    const finalReason = geminiNeedsAttention ? geminiReason : keywordReason;
    const finalPriority = geminiNeedsAttention ? geminiPriority : keywordPriority;

    console.log(`[AI ANALYZE] ${ticketKey}: Gemini=${geminiNeedsAttention}, Keyword=${keywordNeedsAttention}, Final=${finalNeedsAttention}`);
    return res.json({
      needsAttention: finalNeedsAttention,
      reason: finalReason,
      priority: finalPriority,
    });

  } catch (error) {
    console.error("[AI ANALYZE ERROR]", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "AI analysis failed",
    });
  }
});


// ─── Health check ─────────────────────────────────────────────────────────────
// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Jira API Proxy Server running on http://localhost:${PORT}`);
  console.log(`API routes available at http://localhost:${PORT}/api/jira`);
});
