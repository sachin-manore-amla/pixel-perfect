import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

/** Helper to make Jira Agile API requests (different base path: /rest/agile/1.0/) */
async function makeAgileRequest(
  method: string,
  endpoint: string
): Promise<globalThis.Response> {
  if (!jiraConfig) {
    throw new Error("Jira configuration not found");
  }
  const url = `${jiraConfig.instanceUrl}/rest/agile/1.0${endpoint}`;
  const authHeader = `Basic ${Buffer.from(
    `${jiraConfig.email}:${jiraConfig.apiToken}`
  ).toString("base64")}`;
  return fetch(url, {
    method,
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
  });
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
    clearBoardAdminCache();
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
  clearBoardAdminCache();
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
 * POST /api/ai/summarize
 * Summarize a comment using Gemini AI.
 * Body: { text: string }
 */
app.post("/api/ai/summarize", async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "GEMINI_API_KEY not configured" });
    }
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Summarize the following Jira comment in 2-3 concise sentences. Keep it factual, preserve key details like ticket references and action items, and do not add anything not present in the original:\n\n${text}`;
    const result = await model.generateContent(prompt);
    const summary = result.response.text().trim();
    res.json({ summary });
  } catch (error) {
    console.error("[SUMMARIZE ERROR]", error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Summarize failed" });
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
  direction: string; // e.g. "Z10 → Z10LMC"
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
  lastSyncedAt: string | null; // ISO — only show comments created AFTER this
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

// Board admin cache — maps boardId → Set<accountId> of admins (15-min TTL)
let boardAdminMap = new Map<number, Set<string>>();
let boardNameMap = new Map<number, string>();
let boardCacheBuiltAt: number | null = null;
const BOARD_CACHE_TTL_MS = 15 * 60 * 1000;
function clearBoardAdminCache() {
  boardAdminMap = new Map();
  boardNameMap = new Map();
  boardCacheBuiltAt = null;
}

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
        // Emit mention display name inline so it appears in commentBody for rendering
        if (node.type === "mention" && node.attrs?.text) texts.push(node.attrs.text);
        if (node.content) walk(node.content);
      }
    };
    walk(adf.content);
    // Join with newline so #update on its own paragraph doesn't bleed into the next word,
    // which would cause /#update\b/ to fail (e.g. "#updateNew" has no word boundary after "update").
    return texts.join("\n");
  }
  return String(body);
}

/** Escape HTML special characters */
function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Render an ADF node tree to HTML, preserving bullets, bold, mentions, etc. */
function renderADFNodes(nodes: unknown[]): string {
  return (nodes as Array<Record<string, unknown>>).map(renderADFNode).join("");
}
function renderADFNode(n: Record<string, unknown>): string {
  const children = Array.isArray(n.content) ? renderADFNodes(n.content as unknown[]) : "";
  switch (n.type) {
    case "doc": return children;
    case "paragraph": return `<p>${children || "<br>"}</p>`;
    case "heading": {
      const lvl = Number((n.attrs as Record<string, unknown>)?.level ?? 3);
      return `<h${lvl}>${children}</h${lvl}>`;
    }
    case "bulletList": return `<ul>${children}</ul>`;
    case "orderedList": return `<ol>${children}</ol>`;
    case "listItem": return `<li>${children}</li>`;
    case "blockquote": return `<blockquote>${children}</blockquote>`;
    case "codeBlock": return `<pre><code>${children}</code></pre>`;
    case "rule": return "<hr>";
    case "hardBreak": return "<br>";
    case "text": {
      let t = escHtml(String(n.text ?? ""));
      const marks = Array.isArray(n.marks)
        ? (n.marks as Array<{ type: string; attrs?: Record<string, unknown> }>)
        : [];
      for (const mark of marks) {
        if (mark.type === "strong") t = `<strong>${t}</strong>`;
        else if (mark.type === "em") t = `<em>${t}</em>`;
        else if (mark.type === "code") t = `<code>${t}</code>`;
        else if (mark.type === "strike") t = `<s>${t}</s>`;
        else if (mark.type === "underline") t = `<u>${t}</u>`;
        else if (mark.type === "link") {
          const href = escHtml(String(mark.attrs?.href ?? ""));
          t = `<a href="${href}" target="_blank" rel="noopener noreferrer">${t}</a>`;
        }
      }
      return t;
    }
    case "mention": {
      const text = escHtml(String((n.attrs as Record<string, unknown>)?.text ?? ""));
      return `<span class="adf-mention">${text}</span>`;
    }
    case "inlineCard": return ""; // displayed separately in external links section
    case "mediaSingle": return ""; // displayed separately as attachment badges
    case "media": return ""; // displayed separately as attachment badges
    default:
      return children; // recurse into unknown node types
  }
}

/** Convert a full ADF document to HTML */
function extractADFHtml(body: unknown): string {
  if (typeof body !== "object" || body === null) return "";
  const doc = body as { type?: string; content?: unknown[] };
  if (!Array.isArray(doc.content)) return "";
  return renderADFNodes(doc.content);
}

/** Extract all @mentioned display names from an ADF comment body */
function extractMentions(body: unknown): string[] {
  const mentions: string[] = [];
  if (typeof body !== "object" || body === null) return mentions;
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as Array<{ type?: string; attrs?: { text?: string }; content?: unknown[] }>) {
      if (node.type === "mention" && node.attrs?.text) {
        // ADF mention text looks like "@Grecy Bais" — strip the leading @
        mentions.push(node.attrs.text.replace(/^@/, "").trim());
      }
      if (node.content) walk(node.content);
    }
  };
  const adf = body as { content?: unknown[] };
  if (adf.content) walk(adf.content);
  return mentions;
}

/**
 * Walk a comment's ADF body and extract only the media files and external
 * link cards embedded in THAT comment — not all issue-level attachments.
 */
function extractCommentMediaInfo(body: unknown): {
  attachments: Array<{ name: string }>;
  links: string[];
} {
  const attachments: Array<{ name: string }> = [];
  const links: string[] = [];
  if (typeof body !== "object" || body === null) return { attachments, links };
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as Array<{ type?: string; attrs?: Record<string, unknown>; content?: unknown[] }>) {
      if (node.type === "media") {
        // Some Jira clients embed __fileName in the attrs; fall back to media type label
        const fileName = node.attrs?.["__fileName"] as string | undefined;
        const mediaType = String(node.attrs?.["type"] ?? "file");
        attachments.push({ name: fileName || (mediaType === "image" ? "image" : "file") });
      }
      if (node.type === "inlineCard" && node.attrs?.["url"]) {
        links.push(String(node.attrs["url"]));
      }
      if (node.content) walk(node.content);
    }
  };
  const adf = body as { content?: unknown[] };
  if (adf.content) walk(adf.content);
  return { attachments, links };
}

/**
 * Walk an ADF document and remove all occurrences of #update from text nodes.
 * Preserves all formatting marks, mentions, bullet lists, tables, etc.
 */
function stripHashtagFromADF(node: unknown): unknown {
  if (typeof node !== "object" || node === null) return node;
  const n = node as Record<string, unknown>;

  // Text node — strip the hashtag in-place
  if (n.type === "text" && typeof n.text === "string") {
    const cleaned = n.text.replace(/#update\b/gi, "").replace(/^\s+/, "");
    if (cleaned === "") return null; // drop empty text nodes
    return { ...n, text: cleaned };
  }

  // Any node with children — recurse and filter out nulls
  if (Array.isArray(n.content)) {
    const cleanedContent = (n.content as unknown[])
      .map(stripHashtagFromADF)
      .filter((c) => c !== null);
    return { ...n, content: cleanedContent };
  }

  return n;
}

/**
 * Walk an ADF node tree and remap every media node's collection ID
 * from the source issue to the destination issue, so inline images
 * render correctly after the comment is posted to the other ticket.
 */
function remapMediaCollections(node: unknown, destIssueId: string): unknown {
  if (typeof node !== "object" || node === null) return node;
  const n = node as Record<string, unknown>;

  if (n.type === "media" && n.attrs && typeof n.attrs === "object") {
    const attrs = n.attrs as Record<string, unknown>;
    return { ...n, attrs: { ...attrs, collection: `contentId-${destIssueId}` } };
  }

  if (Array.isArray(n.content)) {
    return { ...n, content: (n.content as unknown[]).map((c) => remapMediaCollections(c, destIssueId)) };
  }

  return n;
}

/**
 * Download all attachments from the source issue and re-upload them to
 * the destination issue. Runs fire-and-forget — never throws.
 */
async function copyAttachmentsToDestination(
  sourceKey: string,
  destKey: string,
  attachments: Array<{ filename: string; content: string; mimeType: string }>
): Promise<void> {
  if (!jiraConfig || attachments.length === 0) return;
  const auth = `Basic ${Buffer.from(`${jiraConfig.email}:${jiraConfig.apiToken}`).toString("base64")}`;
  console.log(`[SYNC] Copying ${attachments.length} attachment(s) from ${sourceKey} → ${destKey}`);

  const results = await Promise.allSettled(
    attachments.map(async (att) => {
      const dlRes = await fetch(att.content, { headers: { Authorization: auth } });
      if (!dlRes.ok) throw new Error(`Download failed for "${att.filename}": ${dlRes.status}`);
      const buffer = await dlRes.arrayBuffer();
      const blob = new Blob([buffer], { type: att.mimeType });

      const form = new FormData();
      form.append("file", blob, att.filename);
      const uploadRes = await fetch(
        `${jiraConfig!.instanceUrl}/rest/api/3/issue/${destKey}/attachments`,
        {
          method: "POST",
          headers: { Authorization: auth, "X-Atlassian-Token": "no-check" },
          body: form,
        }
      );
      if (!uploadRes.ok) throw new Error(`Upload failed for "${att.filename}": ${uploadRes.status}`);
      console.log(`[SYNC] Copied attachment "${att.filename}" → ${destKey}`);
    })
  );

  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.warn(
      `[SYNC] ${failed.length} attachment(s) failed to copy to ${destKey}:`,
      (failed as PromiseRejectedResult[]).map((r) => r.reason?.message).join(", ")
    );
  }
}

/** Build (or refresh) the in-memory board admin cache for all selected projects */
async function buildBoardAdminCache(projects: string[]): Promise<void> {
  const now = Date.now();
  if (boardCacheBuiltAt && now - boardCacheBuiltAt < BOARD_CACHE_TTL_MS) return;

  console.log("[BOARD CACHE] Building board admin cache for:", projects);
  const newAdminMap = new Map<number, Set<string>>();
  const newNameMap = new Map<number, string>();

  try {
    const boardLists = await Promise.allSettled(
      projects.map((projectKey) =>
        makeAgileRequest("GET", `/board?projectKeyOrId=${encodeURIComponent(projectKey)}`)
          .then(async (res) => {
            if (!res.ok) {
              console.warn(`[BOARD CACHE] ${res.status} on board list for ${projectKey} — skipping`);
              return [] as Array<{ id: number; name: string }>;
            }
            const data = await res.json() as { values?: Array<{ id: number; name: string }> };
            return data.values || [];
          })
          .catch(() => [] as Array<{ id: number; name: string }>)
      )
    );

    const allBoards: Array<{ id: number; name: string }> = boardLists.flatMap((r) =>
      r.status === "fulfilled" ? r.value : []
    );

    if (allBoards.length === 0) {
      console.warn("[BOARD CACHE] No boards returned — admin check disabled, allowing all");
      boardCacheBuiltAt = now;
      boardAdminMap = newAdminMap;
      boardNameMap = newNameMap;
      return;
    }

    await Promise.allSettled(
      allBoards.map(async (board) => {
        try {
          const res = await makeAgileRequest("GET", `/board/${board.id}`);
          if (!res.ok) return;
          const data = await res.json() as {
            admins?: { users?: Array<{ accountId: string }> };
          };
          const adminIds = new Set<string>(
            (data.admins?.users || []).map((u) => u.accountId)
          );
          newAdminMap.set(board.id, adminIds);
          newNameMap.set(board.id, board.name);
        } catch {
          // skip individual board failures
        }
      })
    );

    boardAdminMap = newAdminMap;
    boardNameMap = newNameMap;
    boardCacheBuiltAt = now;
    console.log(`[BOARD CACHE] Cached ${newAdminMap.size} boards`);
  } catch (e) {
    console.warn("[BOARD CACHE] Failed to build cache:", e);
  }
}

/**
 * Core sync logic — shared between single and bulk sync endpoints.
 * Fetches the raw ADF comment from Jira, strips #update, and posts as-is
 * to the cloned linked ticket — preserving all formatting and @mentions.
 */
async function internalSyncComment(
  issueKey: string,
  commentBody: string,
  commentId: string,
  author: string
): Promise<SyncRecord> {
  console.log(`[SYNC] Fetching issue ${issueKey} for linked tickets`);
  const issueRes = await makeJiraRequest("GET", `/issue/${issueKey}?fields=summary,issuelinks,attachment`);
  if (!issueRes.ok) throw new Error(`Failed to fetch issue ${issueKey} from Jira (${issueRes.status})`);
  const issueData = await issueRes.json();

  const links: Array<{
    type?: { name?: string; inward?: string; outward?: string };
    outwardIssue?: { key: string };
    inwardIssue?: { key: string };
  }> = issueData.fields?.issuelinks || [];

  const attachments: Array<{ filename: string; content: string; mimeType: string }> =
    issueData.fields?.attachment || [];

  // Only sync across "is cloned by" / "clones" relationships
  const cloneLink = links.find(
    (l) =>
      l.type?.name === "Cloners" ||
      l.type?.inward === "is cloned by" ||
      l.type?.outward === "clones"
  );
  const linkedKey = cloneLink?.outwardIssue?.key || cloneLink?.inwardIssue?.key;

  if (!linkedKey) {
    throw new Error(
      `No 'is cloned by' linked ticket found on ${issueKey}. Ensure a clone link exists in Jira.`
    );
  }

  const sourceProject = issueKey.split("-")[0];
  const targetProject = linkedKey.split("-")[0];
  const direction = `${sourceProject} → ${targetProject}`;

  // Fetch the raw ADF body + destination contacts in parallel
  const [rawADFResult, destContactsResult] = await Promise.allSettled([
    commentId
      ? makeJiraRequest("GET", `/issue/${issueKey}/comment/${commentId}`)
          .then(async (r) => {
            if (!r.ok) return null;
            const d = await r.json() as { body?: Record<string, unknown> };
            return d.body ?? null;
          })
          .catch(() => null)
      : Promise.resolve(null),
    makeJiraRequest("GET", `/issue/${linkedKey}?fields=reporter,comment`)
      .then(async (r) => {
        if (!r.ok) return null;
        const d = await r.json() as {
          id?: string;
          fields?: {
            reporter?: { accountId?: string; displayName?: string };
            comment?: { comments?: Array<{ author?: { accountId?: string; displayName?: string } }> };
          };
        };
        return { destId: d.id ?? "", fields: d.fields ?? null };
      })
      .catch(() => null),
  ]);

  const rawADF = rawADFResult.status === "fulfilled" ? rawADFResult.value : null;
  const destResult = destContactsResult.status === "fulfilled" ? destContactsResult.value : null;
  const destId = destResult?.destId ?? "";
  const destFields = destResult?.fields ?? null;

  // Build notification paragraph (destination reporter + last commenter, deduped by accountId)
  const contactMap = new Map<string, string>(); // accountId → displayName
  if (destFields?.reporter?.accountId) {
    contactMap.set(destFields.reporter.accountId, destFields.reporter.displayName ?? "");
  }
  const destComments = destFields?.comment?.comments ?? [];
  const lastCommenter = destComments[destComments.length - 1]?.author;
  if (lastCommenter?.accountId && !contactMap.has(lastCommenter.accountId)) {
    contactMap.set(lastCommenter.accountId, lastCommenter.displayName ?? "");
  }
  let notificationParagraph: unknown | null = null;
  if (contactMap.size > 0) {
    const mentionNodes: unknown[] = [];
    contactMap.forEach((displayName, accountId) => {
      if (mentionNodes.length > 0) mentionNodes.push({ type: "text", text: " " });
      mentionNodes.push({ type: "mention", attrs: { id: accountId, text: `@${displayName}` } });
    });
    notificationParagraph = { type: "paragraph", content: mentionNodes };
  }

  // Strip #update from the ADF tree; fall back to plain-text paragraph if no ADF
  const attribution = `Posted by JiraTriage · ${issueKey}`;
  const attributionParagraph = {
    type: "paragraph",
    content: [{ type: "text", text: attribution, marks: [{ type: "em" }] }],
  };

  let postBody: unknown;
  if (rawADF && rawADF.type === "doc" && Array.isArray(rawADF.content)) {
    const cleanedADF = stripHashtagFromADF(rawADF) as Record<string, unknown>;
    const remappedContent = destId
      ? (cleanedADF.content as unknown[]).map((c) => remapMediaCollections(c, destId))
      : (cleanedADF.content as unknown[]) ?? [];
    const bodyContent: unknown[] = [];
    if (notificationParagraph) bodyContent.push(notificationParagraph);
    bodyContent.push(...remappedContent, attributionParagraph);
    postBody = { type: "doc", version: 1, content: bodyContent };
  } else {
    // Fallback: plain text (formatting not available)
    const cleaned = commentBody.replace(/#update\b/gi, "").trim();
    const bodyContent: unknown[] = [];
    if (notificationParagraph) bodyContent.push(notificationParagraph);
    bodyContent.push(
      { type: "paragraph", content: [{ type: "text", text: cleaned }] },
      attributionParagraph,
    );
    postBody = { type: "doc", version: 1, content: bodyContent };
  }

  console.log(`[SYNC] Copying comment to ${linkedKey} (${direction})`);
  const postRes = await makeJiraRequest("POST", `/issue/${linkedKey}/comment`, { body: postBody });
  const postData = await postRes.json();

  const record: SyncRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceKey: issueKey,
    targetKey: linkedKey,
    direction,
    commentId,
    originalComment: commentBody,
    transformedComment: commentBody.replace(/#update\b/gi, "").trim(),
    author,
    timestamp: new Date().toISOString(),
    status: postRes.ok ? "success" : "failed",
    error: postRes.ok ? undefined : JSON.stringify(postData),
  };

  registerSyncRecord(record);
  console.log(`[SYNC] ${record.status.toUpperCase()} — ${issueKey} → ${linkedKey}`);

  // Copy attachments fire-and-forget — does not block the sync response
  if (record.status === "success" && attachments.length > 0) {
    copyAttachmentsToDestination(issueKey, linkedKey, attachments).catch(() => {/* logged inside */});
  }

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

      const isToZLMC = /#updateforzlmc/i.test(commentBody);
      const isToZ10 = /#updateforz10/i.test(commentBody);
      if (!isToZLMC && !isToZ10 && !/#update\b/i.test(commentBody)) {
        return res.status(400).json({ error: "No sync hashtag (#update) found in comment" });
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
 * JQL-scan selected projects for comments with #update hashtag.
 * Optimized: parallel project JQL + parallel comment fetching (10 at a time).
 * Body: { days?: number (default 1), maxIssues?: number (default 200), projects?: string[] }
 */
app.post(
  "/api/jira/auto-discover",
  requireJiraConfig,
  async (req: Request, res: Response) => {
    try {
      const { days = 1, maxIssues = 200, projects = [] } = req.body || {};

      if (!jiraConfig) return res.status(400).json({ error: "Jira not configured" });
      if (!Array.isArray(projects) || projects.length === 0) {
        return res.json({ results: [], scanned: 0, message: "No projects configured" });
      }

      const authHeader = `Basic ${Buffer.from(
        `${jiraConfig.email}:${jiraConfig.apiToken}`
      ).toString("base64")}`;

      // Resolve current user + prime board admin cache in parallel (cache TTL-aware)
      const [myselfResult] = await Promise.allSettled([
        makeJiraRequest("GET", "/myself"),
        buildBoardAdminCache(projects as string[]),
      ]);
      let currentUserAccountId: string | null = null;
      if (myselfResult.status === "fulfilled" && myselfResult.value.ok) {
        const me = await myselfResult.value.json() as { accountId?: string };
        currentUserAccountId = me.accountId ?? null;
      }

      // Smart window: tighten JQL window based on time since last sync
      let updatedFilter: string;
      if (lastSyncedAt) {
        const msSince = Date.now() - new Date(lastSyncedAt).getTime();
        const daysSince = Math.ceil(msSince / 86_400_000) + 1;
        updatedFilter = `-${Math.min(daysSince, days)}d`;
      } else {
        updatedFilter = `-${days}d`;
      }

      // One JQL query per selected project — all run in parallel
      const allIssueKeys: string[] = [];
      await Promise.allSettled(
        (projects as string[]).map(async (projectKey) => {
          const jql = `project = ${projectKey} AND updated >= "${updatedFilter}" ORDER BY updated DESC`;
          try {
            const url = new URL(`${jiraConfig!.instanceUrl}/rest/api/3/search/jql`);
            url.searchParams.append("jql", jql);
            url.searchParams.append("maxResults", String(maxIssues));
            url.searchParams.append("fields", "key");

            const searchRes = await fetch(url.toString(), {
              method: "GET",
              headers: { Authorization: authHeader, "Content-Type": "application/json" },
            });
            if (!searchRes.ok) { console.warn(`[AUTO-DISCOVER] JQL failed: ${jql}`); return; }
            const data = (await searchRes.json()) as { issues?: Array<{ key: string }> };
            allIssueKeys.push(...(data.issues || []).map((i) => i.key));
          } catch (e) {
            console.error("[AUTO-DISCOVER] JQL error:", e);
          }
        })
      );

      const uniqueKeys = [...new Set(allIssueKeys)];
      console.log(`[AUTO-DISCOVER] Scanning ${uniqueKeys.length} tickets across [${projects.join(", ")}] (window: ${updatedFilter})`);

      const results: Array<{
        issueKey: string;
        commentId: string;
        commentBody: string;
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
        commentBodyHtml: string;
      }> = [];

      const projectSet = new Set((projects as string[]).map((p: string) => p.toUpperCase()));

      // Fetch comments + issuelinks for all tickets in parallel (10 at a time)
      await runConcurrent(
        uniqueKeys,
        async (key) => {
          const commentsRes = await makeJiraRequest("GET", `/issue/${key}?fields=comment,issuelinks,sprint,attachment`);
          if (!commentsRes.ok) return;
          const data = await commentsRes.json();

          // Resolve the clone-linked ticket for this issue
          const links: Array<{
            type?: { name?: string; inward?: string; outward?: string };
            outwardIssue?: { key: string };
            inwardIssue?: { key: string };
          }> = data.fields?.issuelinks || [];

          const cloneLink = links.find(
            (l) =>
              l.type?.name === "Cloners" ||
              l.type?.inward === "is cloned by" ||
              l.type?.outward === "clones"
          );
          const linkedKey = cloneLink?.outwardIssue?.key || cloneLink?.inwardIssue?.key;

          // Skip if no clone link or linked project is not in the user's selected list
          if (!linkedKey) return;
          const linkedProject = linkedKey.split("-")[0].toUpperCase();
          if (!projectSet.has(linkedProject)) return;

          const sourceProject = key.split("-")[0];
          const targetProject = linkedKey.split("-")[0];

          const sprintField = data.fields?.sprint as { boardId?: number; name?: string } | null | undefined;
          const issueBoardId: number | null = sprintField?.boardId ?? null;
          const issueBoardName: string = (issueBoardId !== null ? boardNameMap.get(issueBoardId) : undefined) ?? sprintField?.name ?? "";
          const issueAttachments: Array<{ id: string; filename: string; content: string; created: string }> = data.fields?.attachment || [];
          // filename (lowercase) → attachment, for exact-match lookup
          const filenameToAtt = new Map(issueAttachments.map((a) => [a.filename.toLowerCase(), a]));
          // sorted by proximity — used as fallback when __fileName not in ADF
          const attSortedByProximity = (commentCreatedMs: number) =>
            [...issueAttachments].sort(
              (a, b) =>
                Math.abs(new Date(a.created).getTime() - commentCreatedMs) -
                Math.abs(new Date(b.created).getTime() - commentCreatedMs)
            );
          const comments: Array<{
            id: string;
            body: unknown;
            author?: { displayName?: string; accountId?: string };
            created: string;
          }> = data.fields?.comment?.comments || [];

          for (const c of comments) {
            const text = extractADFText(c.body);
            if (!/#update\b/i.test(text)) continue;
            if (isAlreadySynced(key, c.id)) continue;

            const authorAccountId = c.author?.accountId ?? "";
            const isAuthor = !!authorAccountId && authorAccountId === currentUserAccountId;
            let authorizedToPost = false;
            if (currentUserAccountId) {
              if (isAuthor) {
                // Authors can always post their own comments
                authorizedToPost = true;
              } else if (boardAdminMap.size === 0) {
                // Agile API unavailable — allow all (graceful fallback)
                authorizedToPost = true;
              } else if (issueBoardId !== null) {
                const boardAdmins = boardAdminMap.get(issueBoardId);
                authorizedToPost = boardAdmins?.has(currentUserAccountId) ?? false;
              }
              // else: ticket not in a sprint → not authorized
            }

            const mediaInfo = extractCommentMediaInfo(c.body);
            // ADF media nodes give the EXACT count of attachments in this comment.
            // Match each node to a real issue attachment: exact filename first, then
            // closest-by-timestamp fallback. Build /secure/attachment/ URL (opens in
            // tab, no forced download) instead of the REST content URL.
            const commentMs = new Date(c.created).getTime();
            const usedIds = new Set<string>();
            const commentAttachments = mediaInfo.attachments.map((adfAtt) => {
              // 1. Try exact filename match (__fileName from ADF attrs)
              const exact = filenameToAtt.get(adfAtt.name.toLowerCase());
              if (exact && !usedIds.has(exact.id)) {
                usedIds.add(exact.id);
                return {
                  name: exact.filename,
                  url: `${jiraConfig!.instanceUrl}/secure/attachment/${exact.id}/${encodeURIComponent(exact.filename)}`,
                };
              }
              // 2. Fall back: closest unused attachment by timestamp
              for (const att of attSortedByProximity(commentMs)) {
                if (!usedIds.has(att.id)) {
                  usedIds.add(att.id);
                  return {
                    name: att.filename,
                    url: `${jiraConfig!.instanceUrl}/secure/attachment/${att.id}/${encodeURIComponent(att.filename)}`,
                  };
                }
              }
              return { name: adfAtt.name, url: null };
            });
            results.push({
              issueKey: key,
              commentId: c.id,
              commentBody: text,
              author: c.author?.displayName || "Unknown",
              authorAccountId,
              created: c.created,
              direction: `${sourceProject} → ${targetProject}`,
              mentions: extractMentions(c.body),
              authorizedToPost,
              boardId: issueBoardId,
              boardName: issueBoardName,
              attachmentCount: commentAttachments.length,
              attachments: commentAttachments,
              externalLinkCount: mediaInfo.links.length,
              externalLinks: mediaInfo.links,
              commentBodyHtml: extractADFHtml(c.body),
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

      const results: Array<{
        issueKey: string;
        commentId: string;
        commentBody: string;
        author: string;
        created: string;
        direction: string;
        mentions: string[];
      }> = [];

      for (const key of issueKeys) {
        try {
          const commentsRes = await makeJiraRequest("GET", `/issue/${key}?fields=comment`);
          if (!commentsRes.ok) continue;
          const data = await commentsRes.json();
          const comments: Array<{
            id: string;
            body: unknown;
            author?: { displayName?: string };
            created: string;
          }> = data.fields?.comment?.comments || [];

          for (const c of comments) {
            const text = extractADFText(c.body);
            if (!/#update\b/i.test(text)) continue;

            // Skip only comments that have already been synced
            if (isAlreadySynced(key, c.id)) {
              console.log(`[POLL] Skipping ${key}::${c.id} — already synced`);
              continue;
            }

            results.push({
              issueKey: key,
              commentId: c.id,
              commentBody: text,
              author: c.author?.displayName || "Unknown",
              created: c.created,
              direction: key.split("-")[0],
              mentions: extractMentions(c.body),
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
 * Use OpenAI (same key used for comment sync) to analyze Jira ticket comments
 * and determine if manager attention is needed.
 * Body: { ticketKey: string, ticketSummary: string, comments: Array<{ author: string, text: string }> }
 */
app.post("/api/ai/analyze-comments", async (req: Request, res: Response) => {
  try {
    const { ticketKey, ticketSummary, comments, mentionedUser } = req.body;

    const openaiApiKey = process.env.OPENAI_API_KEY || process.env.REACT_APP_OPENAI_API_KEY;
    if (!openaiApiKey || openaiApiKey.startsWith("sk-test")) {
      return res.status(400).json({ error: "OPENAI_API_KEY not configured" });
    }

    if (!comments || comments.length === 0) {
      return res.json({ needsAttention: false, reason: "", priority: "LOW" });
    }

    // Send last 10 comments only to save tokens
    const commentThread = comments
      .slice(-10)
      .map((c: { author: string; text: string }) => `[${c.author}]: ${c.text}`)
      .join("\n");

    const mentionContext = mentionedUser
      ? `\nContext: The user "${mentionedUser}" was @mentioned in the last few comments. Set needsAttention=true if the mention is ACTIONABLE — meaning they are asked a direct question, asked to provide information or an update, need to resolve a blocker, take a specific action, or give approval. This includes phrases like "please provide", "can you check", "please share", "let us know", "your input needed" even without a question mark. Set needsAttention=false ONLY for passive mentions like FYI, CC, or "as per @user" references where no action is expected.`
      : "";

    const prompt = `You are analyzing a Jira P1 ticket to determine if a specific user needs to take immediate action.\n\nTicket: ${ticketKey}\nSummary: ${ticketSummary}${mentionContext}\n\nRecent Comments:\n${commentThread}\n\nDetermine:\n1. Does the mentioned user need to take action? (true/false)\n   - true ONLY if: direct question asked, blocker to resolve, approval needed, explicit ask for their input\n   - false if: FYI mention, status update, general tag, no clear ask\n2. Priority: HIGH (production/customers impacted), MEDIUM (question unanswered >4h, waiting for approval), LOW (routine)\n3. Reason max 100 chars\n\nRespond ONLY with valid JSON:\n{"needsAttention": true, "priority": "HIGH", "reason": "Blocked deployment waiting for your approval"}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a Jira ticket triage assistant. Always respond with valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 150,
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[AI ANALYZE ERROR]", err);
      return res.status(500).json({ error: "OpenAI API call failed", details: err });
    }

    const data = await response.json() as any;
    const rawText: string = data?.choices?.[0]?.message?.content?.trim() || "";

    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn("[AI ANALYZE] Could not parse response:", rawText);
      return res.json({ needsAttention: false, reason: "AI analysis unavailable", priority: "LOW" });
    }

    const result = JSON.parse(jsonMatch[0]);
    console.log(`[AI ANALYZE] ${ticketKey}: needsAttention=${result.needsAttention}, priority=${result.priority}`);
    res.json(result);
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
