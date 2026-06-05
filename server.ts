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
      for (const node of nodes as Array<{ type?: string; text?: string; content?: unknown[] }>) {
        if (node.type === "text" && node.text) texts.push(node.text);
        if (node.content) walk(node.content);
      }
    };
    walk(adf.content);
    // Join without separator — preserves hashtags like #updateforz10 that may span zero boundaries
    return texts.join("");
  }
  return String(body);
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
  const isToZLMC = /#updateforzlmc/i.test(commentBody);
  const direction: "to-zlmc" | "to-z10" = isToZLMC ? "to-zlmc" : "to-z10";

  console.log(`[SYNC] Fetching issue ${issueKey} for linked tickets`);
  const issueRes = await makeJiraRequest("GET", `/issue/${issueKey}?fields=summary,issuelinks`);
  if (!issueRes.ok) throw new Error(`Failed to fetch issue ${issueKey} from Jira (${issueRes.status})`);
  const issueData = await issueRes.json();
  const ticketSummary: string = issueData.fields?.summary || "";

  const links: Array<{
    outwardIssue?: { key: string };
    inwardIssue?: { key: string };
  }> = issueData.fields?.issuelinks || [];

  let linkedKey: string | null = null;
  for (const link of links) {
    const candidate = link.outwardIssue?.key || link.inwardIssue?.key;
    if (!candidate) continue;
    if (direction === "to-zlmc" && /^Z10LMC-/i.test(candidate)) { linkedKey = candidate; break; }
    if (direction === "to-z10" && /^Z10-\d/i.test(candidate)) { linkedKey = candidate; break; }
  }

  if (!linkedKey) {
    const target = direction === "to-zlmc" ? "ZLMC (Z10LMC-*)" : "Z10 (Z10-*)";
    throw new Error(`No linked ${target} ticket found on ${issueKey}. Ensure tickets are linked in Jira.`);
  }

  console.log(`[SYNC] Transforming comment (${direction}) for linked ticket ${linkedKey}`);
  const transformedComment = await transformCommentWithAI(commentBody, direction, ticketSummary);

  const attribution = `Synced by JiraTriage · ${issueKey}`;

  const postRes = await makeJiraRequest("POST", `/issue/${linkedKey}/comment`, {
    body: {
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", content: [{ type: "text", text: transformedComment }] },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: attribution.trim(),
              marks: [{ type: "em" }],
            },
          ],
        },
      ],
    },
  });
  const postData = await postRes.json();

  const record: SyncRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    sourceKey: issueKey,
    targetKey: linkedKey,
    direction,
    commentId,
    originalComment: commentBody,
    transformedComment,
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

      const isToZLMC = /#updateforzlmc/i.test(commentBody);
      const isToZ10 = /#updateforz10/i.test(commentBody);
      if (!isToZLMC && !isToZ10) {
        return res.status(400).json({ error: "No sync hashtag (#updateforzlmc or #updateforz10) found in comment" });
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
      const { days = 1, maxIssues = 200 } = req.body || {};

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

      const jqlQueries = [
        `project = Z10 AND updated >= "${updatedFilter}" ORDER BY updated DESC`,
        `project = Z10LMC AND updated >= "${updatedFilter}" ORDER BY updated DESC`,
      ];

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

      const results: Array<{
        issueKey: string;
        commentId: string;
        commentBody: string;
        author: string;
        created: string;
        direction: "to-zlmc" | "to-z10";
        mentions: string[];
      }> = [];

      // Fetch comments for all tickets in parallel (10 at a time)
      await runConcurrent(
        uniqueKeys,
        async (key) => {
          const commentsRes = await makeJiraRequest("GET", `/issue/${key}?fields=comment`);
          if (!commentsRes.ok) return;
          const data = await commentsRes.json();
          const comments: Array<{
            id: string;
            body: unknown;
            author?: { displayName?: string };
            created: string;
          }> = data.fields?.comment?.comments || [];

          for (const c of comments) {
            const text = extractADFText(c.body);
            const isToZLMC = /#updateforzlmc/i.test(text);
            const isToZ10 = /#updateforz10/i.test(text);
            if (!isToZLMC && !isToZ10) continue;

            // Skip only comments that have already been synced
            if (isAlreadySynced(key, c.id)) continue;

            results.push({
              issueKey: key,
              commentId: c.id,
              commentBody: text,
              author: c.author?.displayName || "Unknown",
              created: c.created,
              direction: isToZLMC ? "to-zlmc" : "to-z10",
              mentions: extractMentions(c.body),
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
        direction: "to-zlmc" | "to-z10";
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
            const isToZLMC = /#updateforzlmc/i.test(text);
            const isToZ10 = /#updateforz10/i.test(text);
            console.log(`[POLL] ${key} comment ${c.id} — text: "${text.slice(0, 150)}" | toZLMC=${isToZLMC} toZ10=${isToZ10}`);
            if (!isToZLMC && !isToZ10) continue;

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
              direction: isToZLMC ? "to-zlmc" : "to-z10",
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
