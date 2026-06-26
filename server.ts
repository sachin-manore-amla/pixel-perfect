import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import path from "path";
import fs from "fs";

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config();

const app = express();
const PORT = process.env.VITE_API_PORT || 3001;

app.disable("x-powered-by");

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'self'"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
  })
);

app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), fullscreen=(), payment=()"
  );
  next();
});

const isProd = process.env.NODE_ENV === "production";
const envAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultDevOrigins = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

const allowedOrigins = new Set<string>(
  envAllowedOrigins.length > 0
    ? envAllowedOrigins
    : isProd
      ? []
      : defaultDevOrigins
);

if (isProd && allowedOrigins.size === 0) {
  console.warn("[SECURITY] CORS_ALLOWED_ORIGINS is empty in production. Cross-origin browser requests will be blocked.");
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("CORS policy blocked this origin"));
  },
  methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "X-Jira-Url",
    "X-Jira-Email",
    "X-Jira-Token",
  ],
  credentials: false,
  optionsSuccessStatus: 204,
};

// Middleware
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use((error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (error instanceof Error && error.message === "CORS policy blocked this origin") {
    return res.status(403).json({ error: "CORS forbidden for this origin" });
  }
  next(error);
});
app.use(express.json());

// Store Jira config (in production, this would come from secure storage)
interface JiraConfig {
  instanceUrl: string;
  email: string;
  apiToken: string;
}

// Global jiraConfig removed for security - each request must provide credentials

const SYNC_LOG_FILE = path.join(process.cwd(), "sync-debug.log");

function writeSyncLog(message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  try {
    fs.appendFileSync(SYNC_LOG_FILE, `${line}\n`, "utf-8");
  } catch {
    // do not fail request if logging fails
  }
}

// Persisted config functions removed - credentials should not be stored unencrypted on server

// Middleware to authenticate requests using Jira credentials in headers
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const headerUrl = req.headers["x-jira-url"] as string;
  const headerEmail = req.headers["x-jira-email"] as string;
  const headerToken = req.headers["x-jira-token"] as string;

  const body = (req.body || {}) as Partial<JiraConfig>;
  const allowBodyCredentials =
    req.path === "/jira/config" || req.path === "/jira/test";

  const instanceUrl = headerUrl || (allowBodyCredentials ? body.instanceUrl : undefined);
  const email = headerEmail || (allowBodyCredentials ? body.email : undefined);
  const apiToken = headerToken || (allowBodyCredentials ? body.apiToken : undefined);

  if (!instanceUrl || !email || !apiToken) {
    return res.status(401).json({
      error: "Authentication required. Provide X-Jira-Url, X-Jira-Email, and X-Jira-Token headers.",
    });
  }

  try {
    new URL(instanceUrl);
  } catch {
    return res.status(401).json({ error: "Invalid Jira instance URL in headers" });
  }

  (req as any).jiraConfig = {
    instanceUrl: instanceUrl.replace(/\/$/, ""),
    email,
    apiToken,
  };
  next();
};

// Apply authentication to all /api routes
app.use("/api", authenticate);
app.use("/api", applyApiRateLimit);

async function makeJiraRequest(
  req: Request,
  method: string,
  endpoint: string,
  body?: unknown
): Promise<globalThis.Response> {
  const config = (req as any).jiraConfig;
  if (!config) throw new Error("Jira config not found in request");
  return makeJiraRequestWithConfig(config, method, endpoint, body);
}

function makeJiraRequestWithConfig(
  config: JiraConfig,
  method: string,
  endpoint: string,
  body?: unknown
): Promise<globalThis.Response> {
  const url = `${config.instanceUrl}/rest/api/3${endpoint}`;
  const authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;

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

const SEARCH_RATE_LIMIT_WINDOW_MS = 60_000;
const AUTHORIZED_PROJECT_CACHE_TTL_MS = 5 * 60_000;

const API_RATE_LIMIT_WINDOW_MS = 60_000;
const apiRateLimitByIp = new Map<string, { count: number; windowStart: number }>();
const apiRateLimitByUser = new Map<string, { count: number; windowStart: number }>();
const authorizedProjectCache = new Map<string, { expiresAt: number; projectKeys: Set<string> }>();

interface RatePolicy {
  ipMax: number;
  userMax: number;
}

function getRatePolicy(path: string): RatePolicy {
  if (path === "/jira/search") {
    return { ipMax: 20, userMax: 15 };
  }
  if (path === "/jira/projects") {
    return { ipMax: 30, userMax: 20 };
  }
  return { ipMax: 120, userMax: 80 };
}

function extractProjectKeysFromJql(jql: string): string[] {
  const normalizedKeys = new Set<string>();

  const projectEqualsRegex = /\bproject\s*=\s*(?:"([A-Za-z0-9_-]+)"|'([A-Za-z0-9_-]+)'|([A-Za-z0-9_-]+))/gi;
  let match: RegExpExecArray | null;
  while ((match = projectEqualsRegex.exec(jql)) !== null) {
    const key = (match[1] || match[2] || match[3] || "").trim();
    if (key) normalizedKeys.add(key.toUpperCase());
  }

  const projectInRegex = /\bproject\s+in\s*\(([^)]+)\)/gi;
  while ((match = projectInRegex.exec(jql)) !== null) {
    const rawList = (match[1] || "").split(",");
    for (const token of rawList) {
      const key = token.trim().replace(/^['"]|['"]$/g, "");
      if (key) normalizedKeys.add(key.toUpperCase());
    }
  }

  return Array.from(normalizedKeys);
}

function getRateLimitIdentity(req: Request): { ipKey: string; userKey: string } {
  const config = (req as any).jiraConfig as JiraConfig | undefined;
  const body = (req.body || {}) as Partial<JiraConfig>;
  const email = (config?.email || body.email || "anonymous").toLowerCase();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  return {
    ipKey: `ip:${ip}`,
    userKey: `user:${email}`,
  };
}

function updateCounter(
  store: Map<string, { count: number; windowStart: number }>,
  key: string,
  maxAllowed: number
): { limited: boolean; retryAfterSeconds: number; remaining: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now - entry.windowStart >= API_RATE_LIMIT_WINDOW_MS) {
    store.set(key, { count: 1, windowStart: now });
    return { limited: false, retryAfterSeconds: 0, remaining: Math.max(0, maxAllowed - 1) };
  }

  if (entry.count >= maxAllowed) {
    const retryAfterMs = API_RATE_LIMIT_WINDOW_MS - (now - entry.windowStart);
    return {
      limited: true,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      remaining: 0,
    };
  }

  entry.count += 1;
  store.set(key, entry);
  return {
    limited: false,
    retryAfterSeconds: 0,
    remaining: Math.max(0, maxAllowed - entry.count),
  };
}

function applyApiRateLimit(req: Request, res: Response, next: NextFunction) {
  const { ipKey, userKey } = getRateLimitIdentity(req);
  const policy = getRatePolicy(req.path);

  const ipResult = updateCounter(apiRateLimitByIp, ipKey, policy.ipMax);
  const userResult = updateCounter(apiRateLimitByUser, userKey, policy.userMax);

  const effectiveLimit = Math.min(policy.ipMax, policy.userMax);
  const effectiveRemaining = Math.min(ipResult.remaining, userResult.remaining);
  const retryAfterSeconds = Math.max(ipResult.retryAfterSeconds, userResult.retryAfterSeconds);

  res.setHeader("X-RateLimit-Limit", String(effectiveLimit));
  res.setHeader("X-RateLimit-Remaining", String(effectiveRemaining));
  res.setHeader("X-RateLimit-Reset", String(Math.ceil(Date.now() / 1000) + retryAfterSeconds));

  if (ipResult.limited || userResult.limited) {
    res.setHeader("Retry-After", String(retryAfterSeconds));
    console.warn(`[RATE LIMIT] Blocked ${req.method} ${req.path} for ${ipKey} / ${userKey}`);
    return res.status(429).json({
      error: "Rate limit exceeded",
      retryAfterSeconds,
    });
  }

  return next();
}

async function getAuthorizedProjectKeys(req: Request): Promise<Set<string>> {
  const config = (req as any).jiraConfig as JiraConfig;
  const cacheKey = `${config.instanceUrl}|${config.email.toLowerCase()}`;
  const now = Date.now();
  const cached = authorizedProjectCache.get(cacheKey);

  if (cached && cached.expiresAt > now) {
    return cached.projectKeys;
  }

  const projectKeys = new Set<string>();
  let startAt = 0;
  const maxResults = 50;
  let keepGoing = true;

  while (keepGoing) {
    const response = await makeJiraRequest(
      req,
      "GET",
      `/project/search?startAt=${startAt}&maxResults=${maxResults}&orderBy=key`
    );

    if (!response.ok) {
      throw new Error(`Failed to resolve authorized projects: ${response.status}`);
    }

    const data = await response.json() as { values?: Array<{ key: string }>; isLast?: boolean };
    const values = data.values || [];

    for (const project of values) {
      if (project.key) {
        projectKeys.add(project.key.toUpperCase());
      }
    }

    if (data.isLast === true || values.length < maxResults) {
      keepGoing = false;
    } else {
      startAt += values.length;
    }
  }

  authorizedProjectCache.set(cacheKey, {
    expiresAt: now + AUTHORIZED_PROJECT_CACHE_TTL_MS,
    projectKeys,
  });

  return projectKeys;
}

function isJiraJqlErrorPayload(payload: unknown): payload is { errorMessages?: unknown[]; errors?: Record<string, unknown> } {
  if (!payload || typeof payload !== "object") return false;
  const obj = payload as { errorMessages?: unknown; errors?: unknown };
  const hasErrorMessages = Array.isArray(obj.errorMessages) && obj.errorMessages.length > 0;
  const hasErrorsObject = !!obj.errors && typeof obj.errors === "object" && Object.keys(obj.errors as Record<string, unknown>).length > 0;
  return hasErrorMessages || hasErrorsObject;
}

/**
 * Resolve credentials used for sync execution.
 * Sync identity should be provided in headers or via dedicated environment variables.
 */
function getSyncJiraConfig(req?: Request): JiraConfig {
  const instanceUrl = process.env.JIRA_SYNC_INSTANCE_URL;
  const email = process.env.JIRA_SYNC_EMAIL;
  const apiToken = process.env.JIRA_SYNC_API_TOKEN;

  // Use dedicated sync/bot identity only when explicitly configured in environment.
  if (instanceUrl && email && apiToken) {
    return {
      instanceUrl: instanceUrl.replace(/\/$/, ""),
      email,
      apiToken,
    };
  }

  // Otherwise fall back to the authenticated user's credentials
  const config = req ? (req as any).jiraConfig : null;
  if (config) return config;
  throw new Error("Jira configuration not found in request");
}

/** Make a request to the Jira Agile API (/rest/agile/1.0) */
async function makeAgileRequest(config: JiraConfig, method: string, endpoint: string): Promise<globalThis.Response> {
  const url = `${config.instanceUrl}/rest/agile/1.0${endpoint}`;
  const authHeader = `Basic ${Buffer.from(`${config.email}:${config.apiToken}`).toString("base64")}`;
  return fetch(url, { method, headers: { Authorization: authHeader, "Content-Type": "application/json" } });
}

/**
 * POST /api/jira/test
 * Test Jira connection using provided credentials
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

    const url = `${tempConfig.instanceUrl}/rest/api/3/myself`;
    const authHeader = `Basic ${Buffer.from(`${tempConfig.email}:${tempConfig.apiToken}`).toString("base64")}`;

    const fetchResponse = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    if (fetchResponse.ok) {
      res.json({ success: true, message: "Connection successful" });
    } else {
      res.status(fetchResponse.status).json({
        success: false,
        error: `Jira API returned ${fetchResponse.status}`,
      });
    }
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Connection test failed",
    });
  }
});

/**
 * POST /api/jira/config
 * Validate and acknowledge client-side Jira configuration.
 */
app.post("/api/jira/config", (req: Request, res: Response) => {
  const { instanceUrl, email, apiToken } = req.body || {};
  if (!instanceUrl || !email || !apiToken) {
    return res.status(400).json({ error: "Missing required fields: instanceUrl, email, apiToken" });
  }
  return res.json({ success: true, message: "Jira credentials accepted for this session" });
});

/**
 * DELETE /api/jira/config
 * Clear Jira configuration (now just a no-op as server doesn't store it)
 */
app.delete("/api/jira/config", (req: Request, res: Response) => {
  res.json({ success: true, message: "Jira config cleared on client" });
});

/**
 * GET /api/jira/config
 * Check if Jira is configured (returns info from headers)
 */
app.get("/api/jira/config", (req: Request, res: Response) => {
  const config = (req as any).jiraConfig;
  res.json({
    configured: true,
    instanceUrl: config.instanceUrl,
    email: config.email,
  });
});

/**
 * GET /api/jira/api/*
 * Proxy GET requests to Jira API
 */
app.get("/api/jira/api/*", async (req: Request, res: Response) => {
  try {
    const config = (req as any).jiraConfig;
    // Extract everything after /api/jira/api from the original URL
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY GET] Endpoint: ${endpoint}`);

    const response = await makeJiraRequestWithConfig(config, "GET", endpoint);
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
app.post("/api/jira/api/*", async (req: Request, res: Response) => {
  try {
    const config = (req as any).jiraConfig;
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY POST] Endpoint: ${endpoint}`);

    const response = await makeJiraRequestWithConfig(config, "POST", endpoint, req.body);
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
app.put("/api/jira/api/*", async (req: Request, res: Response) => {
  try {
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY PUT] Endpoint: ${endpoint}`);

    const response = await makeJiraRequest(req, "PUT", endpoint, req.body);

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
app.patch("/api/jira/api/*", async (req: Request, res: Response) => {
  try {
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY PATCH] Endpoint: ${endpoint}`);

    const response = await makeJiraRequest(req, "PATCH", endpoint, req.body);

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
app.delete("/api/jira/api/*", async (req: Request, res: Response) => {
  try {
    const match = req.originalUrl.match(/^\/api\/jira\/api(.*)$/);
    const endpoint = match ? match[1] : "";
    
    if (!endpoint) {
      return res.status(400).json({ error: "Invalid endpoint" });
    }
    
    console.log(`[PROXY DELETE] Endpoint: ${endpoint}`);

    const response = await makeJiraRequest(req, "DELETE", endpoint);

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
app.post("/api/jira/search", async (req: Request, res: Response) => {
  try {
    const { jql, maxResults = 50, startAt = 0, fields } = req.body;

    if (!jql || typeof jql !== "string") {
      return res.status(400).json({ error: "JQL query is required" });
    }

    const scopedProjectKeys = extractProjectKeysFromJql(jql);
    if (scopedProjectKeys.length === 0) {
      return res.status(400).json({
        error: "JQL must include explicit project scope (e.g. project = ABC or project in (ABC, XYZ))",
      });
    }

    const authorizedProjectKeys = await getAuthorizedProjectKeys(req);
    const unauthorizedProjects = scopedProjectKeys.filter((key) => !authorizedProjectKeys.has(key));
    if (unauthorizedProjects.length > 0) {
      return res.status(403).json({
        error: `JQL includes unauthorized project keys: ${unauthorizedProjects.join(", ")}`,
      });
    }

    const config = (req as any).jiraConfig;
    const url = new URL(`${config.instanceUrl}/rest/api/3/search/jql`);
    url.searchParams.append("jql", jql);
    url.searchParams.append("maxResults", Math.min(Math.max(Number(maxResults) || 50, 1), 100).toString());
    url.searchParams.append("startAt", Math.max(Number(startAt) || 0, 0).toString());

    if (fields && Array.isArray(fields)) {
      url.searchParams.append("fields", fields.join(","));
    }

    const authHeader = `Basic ${Buffer.from(
      `${config.email}:${config.apiToken}`
    ).toString("base64")}`;

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    const jiraErrorPayload = isJiraJqlErrorPayload(data);

    if (!response.ok || jiraErrorPayload) {
      console.error("[JQL SEARCH ERROR]", {
        status: response.status,
        jiraErrorPayload: data,
      });

      if (response.status === 400 || jiraErrorPayload) {
        return res.status(400).json({ error: "Invalid query" });
      }

      return res.status(502).json({ error: "Search request failed" });
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error("[JQL SEARCH ERROR]", error);
    return res.status(500).json({ error: "Search request failed" });
  }
});

/**
 * GET /api/jira/watchers/:issueKey
 * Get watchers for a specific issue
 */
app.get("/api/jira/watchers/:issueKey", async (req: Request, res: Response) => {
  try {
    const { issueKey } = req.params;
    if (!issueKey) {
      return res.status(400).json({ error: "Issue key is required" });
    }

    const response = await makeJiraRequest(req, "GET", `/issue/${issueKey}/watchers`);
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
app.get("/api/jira/issue/:issueKey/comment", async (req: Request, res: Response) => {
  try {
    const { issueKey } = req.params;
    
    if (!issueKey) {
      return res.status(400).json({ error: "Issue key is required" });
    }

    console.log(`[COMMENTS] Fetching comments for ${issueKey}`);

    const response = await makeJiraRequest(req, "GET", `/issue/${issueKey}?fields=comment`);
    
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
app.get("/api/jira/current-user", async (req: Request, res: Response) => {
  try {
    const response = await makeJiraRequest(req, "GET", `/myself`);
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
app.get("/api/jira/projects", async (req: Request, res: Response) => {
  try {
    // Fetch all projects with pagination
    let allProjects: Array<{ id: string; key: string; name: string; projectTypeKey: string }> = [];
    let startAt = 0;
    const maxResults = 50;
    let isLast = false;

    while (!isLast) {
      const response = await makeJiraRequest(
        req,
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
app.post("/api/jira/check-user-commented",  async (req: Request, res: Response) => {
  try {
    const { issueKeys } = req.body;
    if (!issueKeys || !Array.isArray(issueKeys)) {
      return res.status(400).json({ error: "issueKeys array is required" });
    }

    // Get current user
    const userResponse = await makeJiraRequest(req, "GET", `/myself`);
    const currentUser = await userResponse.json();
    const currentUserEmail = currentUser.emailAddress;

    // Check comments for each issue
    const results: { [key: string]: boolean } = {};

    for (const issueKey of issueKeys) {
      try {
        const commentsResponse = await makeJiraRequest(req, "GET", `/issues/${issueKey}?fields=comment`);
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
app.post("/api/jira/check-watching",  async (req: Request, res: Response) => {
  try {
    const { issueKeys } = req.body;
    if (!issueKeys || !Array.isArray(issueKeys)) {
      return res.status(400).json({ error: "issueKeys array is required" });
    }

    // Get current user
    const userResponse = await makeJiraRequest(req, "GET", `/myself`);
    if (!userResponse.ok) {
      throw new Error("Failed to get current user");
    }
    const currentUser = await userResponse.json();

    // Check watchers for each issue
    const watchingStatus: { [key: string]: boolean } = {};
    
    for (const issueKey of issueKeys) {
      const watchersResponse = await makeJiraRequest(req, "GET", `/issue/${issueKey}/watchers`);
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
app.post("/api/jira/watch-ticket",  async (req: Request, res: Response) => {
  try {
    const { issueKey } = req.body;
    if (!issueKey) {
      return res.status(400).json({ error: "Issue key is required" });
    }

    // Get current user
    const userResponse = await makeJiraRequest(req, "GET", `/myself`);
    if (!userResponse.ok) {
      throw new Error("Failed to get current user");
    }
    const currentUser = await userResponse.json();

    // Add current user as watcher
    const watchResponse = await makeJiraRequest(req, "POST", `/issue/${issueKey}/watchers`, {
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
  direction: string;
  commentId: string;
  originalComment: string;
  transformedComment: string;
  author: string;
  syncedBy?: string;
  timestamp: string;
  status: "success" | "failed";
  error?: string;
}

interface SyncTargetFailure {
  targetKey: string;
  error: string;
}

interface InternalSyncOutcome {
  primaryRecord: SyncRecord;
  propagatedTargets: string[];
  mandatoryFailures: SyncTargetFailure[];
  secondaryFailures: SyncTargetFailure[];
}

// ─── Persistent sync state ───────────────────────────────────────────────────
const SYNC_STATE_FILE = path.join(process.cwd(), ".sync-state.json");
const LEGACY_SYNCED_BY_DEFAULT = "Grecy Yuvrajsingh Bais";
const LEGACY_FAILED_SYNCED_BY_DEFAULT = "Dhanshree Jawade";

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
      const parsedHistory = (parsed.history || []) as SyncRecord[];
      const parsedSyncedIds = parsed.syncedIds || [];
      let historyNormalized = false;
      const normalizedHistory = parsedHistory.map((record) => {
        const failedDefault = record.status === "failed" ? LEGACY_FAILED_SYNCED_BY_DEFAULT : LEGACY_SYNCED_BY_DEFAULT;
        const hasSyncedBy = typeof record.syncedBy === "string" && record.syncedBy.trim().length > 0;

        if (record.status === "failed") {
          const current = (record.syncedBy || "").trim();
          if (current !== LEGACY_FAILED_SYNCED_BY_DEFAULT) {
            historyNormalized = true;
            return { ...record, syncedBy: LEGACY_FAILED_SYNCED_BY_DEFAULT };
          }
          return record;
        }

        if (hasSyncedBy) return record;
        historyNormalized = true;
        return { ...record, syncedBy: failedDefault };
      });

      const historySuccessIds = normalizedHistory
        .filter((record) => record.status === "success" && typeof record.commentId === "string" && record.commentId.trim().length > 0)
        .map((record) => `${record.sourceKey}::${record.commentId}`);
      const mergedSyncedIds = Array.from(new Set<string>([...parsedSyncedIds, ...historySuccessIds]));
      const syncedIdsBackfilled = mergedSyncedIds.length !== parsedSyncedIds.length;

      if (historyNormalized || syncedIdsBackfilled) {
        const normalizedState: SyncState = {
          syncedIds: mergedSyncedIds,
          history: normalizedHistory,
          lastSyncedAt: parsed.lastSyncedAt || null,
        };
        fs.writeFileSync(SYNC_STATE_FILE, JSON.stringify(normalizedState, null, 2), "utf-8");
        console.log(
          `[SYNC STATE] Backfilled state (syncedBy + dedupe IDs). success/default="${LEGACY_SYNCED_BY_DEFAULT}", failed="${LEGACY_FAILED_SYNCED_BY_DEFAULT}", syncedIds=${mergedSyncedIds.length}`
        );
      }

      console.log(`[SYNC STATE] Loaded ${mergedSyncedIds.length} synced IDs, lastSyncedAt=${parsed.lastSyncedAt}`);
      return {
        syncedIds: mergedSyncedIds,
        history: normalizedHistory,
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

function isJiraTriageSystemComment(commentText: string): boolean {
  return /(?:synced by jiratriage|posted by jiratriage)/i.test(commentText);
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

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const obj = node as Record<string, unknown>;

    if (
      obj.type === "mention" &&
      typeof (obj.attrs as any)?.text === "string"
    ) {
      mentions.push(
        ((obj.attrs as any).text as string)
          .replace(/^@/, "")
          .trim()
      );
    }

    Object.values(obj).forEach(walk);
  }

  walk(body);
  return [...new Set(mentions)];
}

/** Extract accountIds of @mentioned users from ADF */
function extractMentionAccountIds(body: unknown): string[] {
  const ids: string[] = [];

  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }

    const obj = node as Record<string, unknown>;

    if (
      obj.type === "mention" &&
      typeof (obj.attrs as any)?.id === "string"
    ) {
      ids.push((obj.attrs as any).id);
    }

    Object.values(obj).forEach(walk);
  }

  walk(body);
  return [...new Set(ids)];
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

async function buildBoardAdminCache(projects: string[], config: JiraConfig): Promise<void> {
  if (boardCacheBuiltAt && Date.now() - boardCacheBuiltAt < BOARD_CACHE_TTL_MS) return;
  const newAdminMap = new Map<number, Set<string>>();
  const newNameMap = new Map<number, string>();
  await Promise.allSettled(
    projects.map(async (key) => {
      try {
        const res = await makeAgileRequest(config, "GET", `/board?projectKeyOrId=${key}`);
        if (!res.ok) return;
        const data = await res.json() as { values?: Array<{ id: number; name: string }> };
        for (const board of data.values || []) {
          newNameMap.set(board.id, board.name);
          const detailRes = await makeAgileRequest(config, "GET", `/board/${board.id}`);
          if (!detailRes.ok) continue;
          const detail = await detailRes.json() as { admins?: { users?: Array<{ accountId: string }> } };
          const adminIds = new Set((detail.admins?.users || []).map((u) => u.accountId));
          newAdminMap.set(board.id, adminIds);
        }
      } catch (error) {
        console.warn(`[BOARD CACHE] Failed to fetch board data for project ${key}`, error);
      }
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

/** Extract source media IDs from ADF in document order */
function extractMediaIdsFromADF(body: unknown): string[] {
  const ids: string[] = [];
  if (typeof body !== "object" || body === null) return ids;
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as Array<Record<string, unknown>>) {
      if (node.type === "media") {
        const id = (node.attrs as Record<string, unknown> | undefined)?.id;
        if (typeof id === "string" && id.trim()) ids.push(id);
      }
      if (node.content) walk(node.content as unknown[]);
    }
  };
  const adfBody = body as { content?: unknown[] };
  if (adfBody.content) walk(adfBody.content);
  return ids;
}

/** Extract Jira attachment IDs referenced in ADF links/cards/text links */
function extractAttachmentIdsFromADF(body: unknown): string[] {
  const ids = new Set<string>();
  if (typeof body !== "object" || body === null) return [];
  const addFromUrl = (url: string) => {
    const patterns = [
      /\/rest\/api\/3\/attachment\/content\/(\d+)/i,
      /\/secure\/attachment\/(\d+)\//i,
      /[?&]attachmentId=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match?.[1]) ids.add(match[1]);
    }
  };
  const walk = (nodes: unknown[]) => {
    for (const node of nodes as Array<Record<string, unknown>>) {
      if (node.type === "inlineCard") {
        const url = (node.attrs as Record<string, unknown> | undefined)?.url;
        if (typeof url === "string") addFromUrl(url);
      }
      if (node.type === "text") {
        const marks = (node.marks as Array<Record<string, unknown>> | undefined) || [];
        for (const mark of marks) {
          if (mark.type !== "link") continue;
          const href = (mark.attrs as Record<string, unknown> | undefined)?.href;
          if (typeof href === "string") addFromUrl(href);
        }
      }
      if (node.content) walk(node.content as unknown[]);
    }
  };
  const adfBody = body as { content?: unknown[] };
  if (adfBody.content) walk(adfBody.content);
  return Array.from(ids);
}

function pickLikelyMediaAttachmentsForComment(
  issueAttachments: Array<{ id: string; filename: string; mimeType: string; mediaApiFileId?: string; created?: string; author?: { accountId?: string } }>,
  sourceMediaCount: number,
  commentCreatedAt?: string,
  commentAuthorId?: string
): Array<{ id: string; filename: string; mimeType: string; mediaApiFileId?: string; created?: string; author?: { accountId?: string } }> {
  if (sourceMediaCount <= 0) return [];
  let candidates = issueAttachments.filter((a) => a.mimeType.startsWith("image/") || a.mimeType.startsWith("video/"));
  if (candidates.length === 0) return [];

  if (commentAuthorId) {
    const byAuthor = candidates.filter((a) => a.author?.accountId === commentAuthorId);
    if (byAuthor.length > 0) candidates = byAuthor;
  }

  const commentTime = commentCreatedAt ? new Date(commentCreatedAt).getTime() : NaN;
  if (!Number.isNaN(commentTime)) {
    candidates = candidates
      .map((att) => ({
        att,
        delta: Math.abs((att.created ? new Date(att.created).getTime() : commentTime) - commentTime),
      }))
      .sort((x, y) => x.delta - y.delta)
      .map((x) => x.att);
  }

  return candidates.slice(0, sourceMediaCount);
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

/**
 * Remap ADF media node IDs to use newly uploaded destination attachment UUIDs.
 * Media nodes whose source mediaApiFileId has no mapping are stripped to prevent ATTACHMENT_VALIDATION_ERROR.
 */
function remapMediaIds(
  node: unknown,
  idMap: Map<string, string>,
  _destIssueNumericId: string
): unknown {
  if (typeof node !== "object" || node === null) return node;
  if (Array.isArray(node)) {
    return (node as unknown[]).map((n) => remapMediaIds(n, idMap, _destIssueNumericId)).filter(Boolean);
  }
  const n = node as Record<string, unknown>;
  // Leaf media node: remap ID or strip if unmappable
  if (n.type === "media") {
    const attrs = (n.attrs || {}) as Record<string, unknown>;
    if ((attrs.type === "link" || attrs.type === "external") && typeof attrs.url === "string") return n;
    const oldId = attrs.id as string | undefined;
    if (!oldId) return null;
    const newId = idMap.get(oldId);
    if (!newId) return null; // no mapping — strip to avoid ATTACHMENT_VALIDATION_ERROR
    return { ...n, attrs: { ...attrs, id: newId, type: "file", collection: "" } };
  }
  // Container media nodes: recurse, drop the container if all children were stripped
  if (n.type === "mediaSingle" || n.type === "mediaGroup") {
    const remappedContent = ((n.content as unknown[]) || [])
      .map((c) => remapMediaIds(c, idMap, _destIssueNumericId))
      .filter(Boolean);
    if (remappedContent.length === 0) return null;
    return { ...n, content: remappedContent };
  }
  // All other nodes: recurse into content
  if (n.content && Array.isArray(n.content)) {
    return { ...n, content: (n.content as unknown[]).map((c) => remapMediaIds(c, idMap, _destIssueNumericId)).filter(Boolean) };
  }
  return n;
}

/** Copy source attachments to destination ticket and return media ID mapping metadata for ADF remapping. */
async function copyAttachmentsToDestination(
  syncConfig: JiraConfig,
  _sourceKey: string,
  destKey: string,
  attachments: Array<{ id: string; filename: string; mimeType: string; mediaApiFileId?: string }>
): Promise<{
  mediaIdMap: Map<string, string>;
  uploadedMediaIdsInOrder: string[];
  uploadedMedia: Array<{
    mediaId?: string;
    sourceMediaId?: string;
    mimeType: string;
    filename: string;
    attachmentId?: string;
    url?: string;
  }>;
}> {
  const mediaIdMap = new Map<string, string>();
  if (attachments.length === 0) {
    return { mediaIdMap, uploadedMediaIdsInOrder: [], uploadedMedia: [] };
  }
  const authHeader = `Basic ${Buffer.from(`${syncConfig.email}:${syncConfig.apiToken}`).toString("base64")}`;
  const fetchMediaIdForAttachment = async (attachmentId: string): Promise<string | undefined> => {
    try {
      const detailRes = await fetch(
        `${syncConfig.instanceUrl}/rest/api/3/attachment/${attachmentId}`,
        { headers: { Authorization: authHeader, "Content-Type": "application/json" } }
      );
      if (!detailRes.ok) return undefined;
      const detail = await detailRes.json() as { mediaApiFileId?: string };
      return detail.mediaApiFileId;
    } catch {
      return undefined;
    }
  };
  const uploadResults = await Promise.all(
    attachments.map(async (att) => {
      try {
        const downloadRes = await fetch(
          `${syncConfig.instanceUrl}/rest/api/3/attachment/content/${att.id}`,
          { headers: { Authorization: authHeader } }
        );
        if (!downloadRes.ok) {
          console.warn(`[ATTACH] Failed to download ${att.filename}: ${downloadRes.status}`);
          return {
            sourceMediaId: att.mediaApiFileId,
            destMediaId: undefined as string | undefined,
            destAttachmentId: undefined as string | undefined,
            filename: att.filename,
          };
        }
        const buffer = await downloadRes.arrayBuffer();
        const formData = new FormData();
        formData.append("file", new Blob([buffer], { type: att.mimeType }), att.filename);
        const uploadRes = await fetch(
          `${syncConfig.instanceUrl}/rest/api/3/issue/${destKey}/attachments`,
          {
            method: "POST",
            headers: { Authorization: authHeader, "X-Atlassian-Token": "no-check" },
            body: formData,
          }
        );
        if (uploadRes.ok) {
          const uploadedList = await uploadRes.json() as Array<{ id?: string | number; mediaApiFileId?: string }>;
          const uploadedAttachmentId = uploadedList[0]?.id != null ? String(uploadedList[0].id) : undefined;
          let newMediaId = uploadedList[0]?.mediaApiFileId;
          if (!newMediaId && uploadedAttachmentId) {
            newMediaId = await fetchMediaIdForAttachment(uploadedAttachmentId);
            if (newMediaId) {
              writeSyncLog(`[ATTACH] Recovered mediaApiFileId for ${att.filename} via attachment detail API`);
            }
          }
          writeSyncLog(`[ATTACH] ✅ Copied ${att.filename}${att.mediaApiFileId && newMediaId ? " (media ID remapped)" : ""}`);
          return {
            sourceMediaId: att.mediaApiFileId,
            destMediaId: newMediaId,
            destAttachmentId: uploadedAttachmentId,
            filename: att.filename,
          };
        } else {
          writeSyncLog(`[ATTACH] Failed to upload ${att.filename}: ${uploadRes.status}`);
          return {
            sourceMediaId: att.mediaApiFileId,
            destMediaId: undefined as string | undefined,
            destAttachmentId: undefined as string | undefined,
            filename: att.filename,
          };
        }
      } catch (e) {
        writeSyncLog(`[ATTACH] Error copying ${att.filename}: ${String(e)}`);
        return {
          sourceMediaId: att.mediaApiFileId,
          destMediaId: undefined as string | undefined,
          destAttachmentId: undefined as string | undefined,
          filename: att.filename,
        };
      }
    })
  );
  const uploadedMediaIdsInOrder: string[] = [];
  const uploadedMedia: Array<{
    mediaId?: string;
    sourceMediaId?: string;
    mimeType: string;
    filename: string;
    attachmentId?: string;
    url?: string;
  }> = [];
  for (const result of uploadResults) {
    if (!result) continue;
    if (result.sourceMediaId && result.destMediaId) {
      mediaIdMap.set(result.sourceMediaId, result.destMediaId);
    }
    if (result.destMediaId) uploadedMediaIdsInOrder.push(result.destMediaId);
  }
  for (let i = 0; i < uploadResults.length; i++) {
    const result = uploadResults[i];
    const att = attachments[i];
    if (!result || !att) continue;
    const attachmentId = result.destAttachmentId as string | undefined;
    const filename = (result.filename as string | undefined) || att.filename;
    const url = attachmentId
      ? `${syncConfig.instanceUrl}/secure/attachment/${attachmentId}/${encodeURIComponent(filename)}`
      : undefined;
    uploadedMedia.push({
      mediaId: result.destMediaId,
      sourceMediaId: result.sourceMediaId,
      mimeType: att.mimeType,
      filename,
      attachmentId,
      url,
    });
  }
  return { mediaIdMap, uploadedMediaIdsInOrder, uploadedMedia };
}

/** Strip #copycomment hashtag text nodes from ADF before posting to destination */
function removeHashtagFromADF(node: unknown): unknown {
  if (typeof node !== "object" || node === null) return node;
  if (Array.isArray(node)) return (node as unknown[]).map((n) => removeHashtagFromADF(n)).filter(Boolean);
  const n = node as Record<string, unknown>;
  if (n.type === "text" && typeof n.text === "string") {
    const cleaned = (n.text as string).replace(/#copycomment\b/gi, "").replace(/\s{2,}/g, " ").trim();
    if (!cleaned) return null;
    return { ...n, text: cleaned };
  }
  if (n.content && Array.isArray(n.content)) {
    return { ...n, content: (n.content as unknown[]).map((c) => removeHashtagFromADF(c)).filter(Boolean) };
  }
  return n;
}

/** Remove media/attachment nodes from ADF to prevent validation errors */
function stripMediaNodes(node: unknown): unknown {
  if (typeof node !== "object" || node === null) return node;
  if (Array.isArray(node)) return (node as unknown[]).map((n) => stripMediaNodes(n)).filter(Boolean);
  const n = node as Record<string, unknown>;
  // Skip media nodes entirely
  if (n.type === "mediaSingle" || n.type === "media" || n.type === "mediaGroup") return null;
  if (n.content && Array.isArray(n.content)) {
    return { ...n, content: (n.content as unknown[]).map((c) => stripMediaNodes(c)).filter(Boolean) };
  }
  return n;
}

/** Remove block nodes with empty content arrays — Jira ADF validator rejects them */
function filterEmptyBlocks(nodes: unknown[]): unknown[] {
  const BLOCK_TYPES = new Set(["paragraph", "heading", "bulletList", "orderedList", "listItem", "blockquote", "codeBlock"]);
  return (nodes as Array<Record<string, unknown>>).reduce<unknown[]>((acc, node) => {
    if (typeof node !== "object" || node === null) return acc;
    if (Array.isArray((node as Record<string, unknown>).content)) {
      const filteredContent = filterEmptyBlocks((node as Record<string, unknown>).content as unknown[]);
      if (BLOCK_TYPES.has((node as Record<string, unknown>).type as string) && filteredContent.length === 0) return acc;
      acc.push({ ...(node as Record<string, unknown>), content: filteredContent });
    } else {
      acc.push(node);
    }
    return acc;
  }, []);
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
function extractCloneNeighborKeys(
  links: Array<{
    type?: { name?: string; inward?: string; outward?: string };
    outwardIssue?: { key: string };
    inwardIssue?: { key: string };
  }>,
  selfKey: string
): string[] {
  const neighbors: string[] = [];
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
    if (candidate && candidate !== selfKey) neighbors.push(candidate);
  }
  return [...new Set(neighbors)];
}

async function syncCommentToTarget(
  syncConfig: JiraConfig,
  issueKey: string,
  linkedKey: string,
  commentBody: string,
  commentId: string,
  author: string,
  syncedBy?: string
): Promise<SyncRecord> {
  // Direction is determined by source project — no hashtag ambiguity
  const isFromZLMC = /^Z10LMC-/i.test(issueKey);
  const direction = isFromZLMC ? "to-z10" : "to-zlmc";

  console.log(`[SYNC] Fetching issue ${issueKey} + raw comment body for target ${linkedKey}`);
  const [issueRes, commentRes] = await Promise.all([
    makeJiraRequestWithConfig(syncConfig, "GET", `/issue/${issueKey}?fields=summary,issuelinks,attachment`),
    commentId ? makeJiraRequestWithConfig(syncConfig, "GET", `/issue/${issueKey}/comment/${commentId}`) : Promise.resolve(null),
  ]);
  if (!issueRes.ok) throw new Error(`Failed to fetch issue ${issueKey} (${issueRes.status})`);
  const issueData = await issueRes.json();
  const issueAttachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    mediaApiFileId?: string;
    created?: string;
    author?: { accountId?: string };
  }> = issueData.fields?.attachment || [];

  // Get raw ADF body
  let rawADFBody: unknown = null;
  let sourceCommentCreatedAt = "";
  let sourceCommentAuthorId = "";
  if (commentRes && commentRes.ok) {
    const cd = await commentRes.json() as { body?: unknown; created?: string; author?: { accountId?: string } };
    rawADFBody = cd.body || null;
    sourceCommentCreatedAt = cd.created || "";
    sourceCommentAuthorId = cd.author?.accountId || "";
  }

  // Fetch destination issue to get reporter + last commenter for @mention notification
  const destRes = await makeJiraRequestWithConfig(syncConfig, "GET", `/issue/${linkedKey}?fields=reporter,comment`);
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

  // Upload attachments to destination first and capture the sourceMediaApiFileId → destMediaApiFileId
  // mapping. This is what allows images to appear inline (embedded) in the destination comment.
  const destIssueNumericId: string = String(destData?.id || "");
  const sourceMediaIds = rawADFBody ? extractMediaIdsFromADF(rawADFBody) : [];
  const sourceAttachmentIds = rawADFBody ? extractAttachmentIdsFromADF(rawADFBody) : [];
  const sourceMediaIdSet = new Set(sourceMediaIds);
  const sourceAttachmentIdSet = new Set(sourceAttachmentIds);
  const directMatchedAttachments = issueAttachments.filter((att) =>
    (att.mediaApiFileId ? sourceMediaIdSet.has(att.mediaApiFileId) : false) ||
    sourceAttachmentIdSet.has(att.id)
  );

  const fallbackAttachments = directMatchedAttachments.length === 0
    ? pickLikelyMediaAttachmentsForComment(
        issueAttachments,
        sourceMediaIds.length,
        sourceCommentCreatedAt,
        sourceCommentAuthorId
      )
    : [];

  const commentAttachments = directMatchedAttachments.length > 0
    ? directMatchedAttachments
    : fallbackAttachments;

  const copyResult = commentAttachments.length > 0
    ? await copyAttachmentsToDestination(syncConfig, issueKey, linkedKey, commentAttachments)
    : { mediaIdMap: new Map<string, string>(), uploadedMediaIdsInOrder: [], uploadedMedia: [] };

  writeSyncLog(
    `[SYNC] Comment-specific attachments on ${issueKey}: ${commentAttachments.length}/${issueAttachments.length}`
  );
  if (directMatchedAttachments.length === 0 && fallbackAttachments.length > 0) {
    writeSyncLog(`[SYNC] Used fallback attachment matching for ${fallbackAttachments.length} media item(s) on ${issueKey}`);
  }

  // Primary mapping uses source attachment mediaApiFileId -> uploaded mediaApiFileId
  // Fallback mapping uses ADF media node order when source mediaApiFileId is unavailable.
  const mediaIdMap = new Map<string, string>(copyResult.mediaIdMap);
  if (sourceMediaIds.length > 0 && copyResult.uploadedMediaIdsInOrder.length > 0) {
    const alreadyMappedTargets = new Set(Array.from(mediaIdMap.keys()));
    const unmappedSourceIds = sourceMediaIds.filter((id) => !alreadyMappedTargets.has(id));
    const maxPairs = Math.min(unmappedSourceIds.length, copyResult.uploadedMediaIdsInOrder.length);
    for (let i = 0; i < maxPairs; i++) {
      mediaIdMap.set(unmappedSourceIds[i], copyResult.uploadedMediaIdsInOrder[i]);
    }
    if (maxPairs > 0) {
      writeSyncLog(`[SYNC] Applied fallback media remap for ${maxPairs} inline media node(s) on ${issueKey}`);
    }
  }

  // Build body content: strip #copycomment hashtag, remap media node IDs so images are embedded inline
  let bodyContent: unknown[];
  if (rawADFBody && typeof rawADFBody === "object" && (rawADFBody as Record<string, unknown>).type === "doc") {
    const cleaned = removeHashtagFromADF(rawADFBody) as Record<string, unknown>;
    const remapped = remapMediaIds(cleaned, mediaIdMap, destIssueNumericId) as Record<string, unknown>;
    bodyContent = filterEmptyBlocks((remapped.content as unknown[]) || []);
  } else {
    const cleaned = commentBody.replace(/#copycomment\b/gi, "").trim();
    bodyContent = [{ type: "paragraph", content: [{ type: "text", text: cleaned }] }];
  }

  // Safety: ensure ADF body is never empty — Jira rejects a doc with no content
  if (bodyContent.length === 0) {
    bodyContent = [{ type: "paragraph", content: [{ type: "text", text: "(no content)" }] }];
  }

  // Inline media fallback:
  // If remap did not preserve all visuals, append missing ones using destination media IDs.
  // This keeps ADF valid (type=file with known destination media IDs) and avoids external URL issues.
  if (copyResult.uploadedMedia.length > 0) {
    const currentMediaCount = extractCommentMediaInfo({ type: "doc", content: bodyContent }).mediaCount;
    const usedDestMediaIds = new Set(Array.from(mediaIdMap.values()));
    const candidateFileMedia = copyResult.uploadedMedia.filter((m) => {
      const isVisual = m.mimeType.startsWith("image/") || m.mimeType.startsWith("video/");
      if (!isVisual || !m.mediaId) return false;
      if (sourceMediaIds.length === 0) return true;
      return !usedDestMediaIds.has(m.mediaId);
    });

    const candidateExternalMedia = copyResult.uploadedMedia.filter((m) => {
      const isVisual = m.mimeType.startsWith("image/") || m.mimeType.startsWith("video/");
      if (!isVisual || !m.url) return false;
      if (m.mediaId && usedDestMediaIds.has(m.mediaId)) return false;
      return true;
    });

    const maxAvailable = Math.max(candidateFileMedia.length, candidateExternalMedia.length);

    const targetAppendCount = sourceMediaIds.length > 0
      ? Math.max(0, sourceMediaIds.length - currentMediaCount)
      : (currentMediaCount === 0 ? maxAvailable : 0);

    const fileFallbackMedia = candidateFileMedia.slice(0, targetAppendCount);
    const remaining = Math.max(0, targetAppendCount - fileFallbackMedia.length);
    const externalFallbackMedia = candidateExternalMedia.slice(0, remaining);

    if (fileFallbackMedia.length > 0 || externalFallbackMedia.length > 0) {
      bodyContent = [
        ...bodyContent,
        ...fileFallbackMedia.map((m) => ({
          type: "mediaSingle",
          attrs: { layout: "center" },
          content: [
            {
              type: "media",
              attrs: {
                id: m.mediaId,
                type: "file",
                collection: "",
              },
            },
          ],
        })),
        ...externalFallbackMedia.map((m) => ({
          type: "mediaSingle",
          attrs: { layout: "center" },
          content: [
            {
              type: "media",
              attrs: {
                type: "external",
                url: m.url,
              },
            },
          ],
        })),
      ];
      writeSyncLog(
        `[SYNC] Appended inline media on ${issueKey}: file=${fileFallbackMedia.length}, external=${externalFallbackMedia.length}, target=${targetAppendCount}`
      );
    }
  }

  const attributionParagraph = {
    type: "paragraph",
    content: [{ type: "text", text: "Posted by JiraTriage", marks: [{ type: "em" }] }],
  };

  const postRes = await makeJiraRequestWithConfig(syncConfig, "POST", `/issue/${linkedKey}/comment`, {
    body: { type: "doc", version: 1, content: [...notifParagraph, ...bodyContent, attributionParagraph] },
  });
  const postData = await postRes.json();

  if (!postRes.ok) {
    writeSyncLog(`[SYNC] ❌ POST comment to ${linkedKey} failed (${postRes.status}): ${JSON.stringify(postData)}`);
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
    syncedBy,
    timestamp: new Date().toISOString(),
    status: postRes.ok ? "success" : "failed",
    error: postRes.ok ? undefined : JSON.stringify(postData),
  };

  registerSyncRecord(record);
  writeSyncLog(`[SYNC] ${record.status.toUpperCase()} — ${issueKey} → ${linkedKey}`);
  return record;
}

/**
 * Core sync logic — shared between single and bulk sync endpoints.
 */
async function internalSyncComment(
  req: Request,
  issueKey: string,
  commentBody: string,
  commentId: string,
  author: string,
  syncedBy?: string
): Promise<InternalSyncOutcome> {
  const syncConfig = getSyncJiraConfig(req);

  const sourceIssueRes = await makeJiraRequestWithConfig(syncConfig, "GET", `/issue/${issueKey}?fields=issuelinks`);
  if (!sourceIssueRes.ok) {
    throw new Error(`Failed to fetch issue links for ${issueKey} (${sourceIssueRes.status})`);
  }
  const sourceIssueData = await sourceIssueRes.json();
  const sourceLinks: Array<{
    type?: { name?: string; inward?: string; outward?: string };
    outwardIssue?: { key: string };
    inwardIssue?: { key: string };
  }> = sourceIssueData.fields?.issuelinks || [];

  const firstLevelTargets = extractCloneNeighborKeys(sourceLinks, issueKey);
  if (firstLevelTargets.length === 0) {
    throw new Error(`No "clones"/"is cloned by" link found on ${issueKey}. Ensure a clone link exists in Jira.`);
  }

  const MAX_TARGETS = 12;
  const mandatoryTargets = firstLevelTargets.slice(0, MAX_TARGETS);
  const targets: string[] = [...mandatoryTargets];
  const visited = new Set<string>([issueKey, ...mandatoryTargets]);
  const queue: string[] = [...mandatoryTargets];

  while (queue.length > 0 && targets.length < MAX_TARGETS) {
    const current = queue.shift() as string;
    try {
      const currentRes = await makeJiraRequestWithConfig(syncConfig, "GET", `/issue/${current}?fields=issuelinks`);
      if (!currentRes.ok) continue;
      const currentData = await currentRes.json();
      const currentLinks: Array<{
        type?: { name?: string; inward?: string; outward?: string };
        outwardIssue?: { key: string };
        inwardIssue?: { key: string };
      }> = currentData.fields?.issuelinks || [];
      const nextTargets = extractCloneNeighborKeys(currentLinks, current).filter((key) => !visited.has(key));

      for (const nextKey of nextTargets) {
        visited.add(nextKey);
        targets.push(nextKey);
        queue.push(nextKey);
        if (targets.length >= MAX_TARGETS) break;
      }
    } catch {
      // best-effort traversal; per-target sync still continues
    }
  }

  if (targets.length > 1) {
    writeSyncLog(`[SYNC] Layered clone targets for ${issueKey}: ${targets.join(" -> ")}`);
  }

  const mandatoryTargetSet = new Set(mandatoryTargets);
  const propagatedTargets: string[] = [];
  const mandatoryFailures: SyncTargetFailure[] = [];
  const secondaryFailures: SyncTargetFailure[] = [];
  let primaryRecord: SyncRecord | null = null;

  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    try {
      const record = await syncCommentToTarget(syncConfig, issueKey, target, commentBody, commentId, author, syncedBy);
      if (!primaryRecord && index === 0) {
        primaryRecord = record;
      }

      if (record.status === "success") {
        propagatedTargets.push(target);
      } else {
        const failure = { targetKey: target, error: record.error || `POST failed for ${target}` };
        if (mandatoryTargetSet.has(target)) {
          mandatoryFailures.push(failure);
        } else {
          secondaryFailures.push(failure);
        }
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      writeSyncLog(`[SYNC] Nested sync failed ${issueKey} -> ${target}: ${errMsg}`);
      const failure = { targetKey: target, error: errMsg };
      if (mandatoryTargetSet.has(target)) {
        mandatoryFailures.push(failure);
      } else {
        secondaryFailures.push(failure);
      }
    }
  }

  if (mandatoryFailures.length > 0) {
    const err = new Error(
      `First-layer sync failed for ${issueKey}: ${mandatoryFailures.map((f) => `${f.targetKey} (${f.error})`).join("; ")}`
    ) as Error & {
      mandatoryFailures?: SyncTargetFailure[];
      secondaryFailures?: SyncTargetFailure[];
      propagatedTargets?: string[];
    };
    err.mandatoryFailures = mandatoryFailures;
    err.secondaryFailures = secondaryFailures;
    err.propagatedTargets = propagatedTargets;
    throw err;
  }

  if (!primaryRecord) {
    throw new Error(`Failed to sync comment from ${issueKey}`);
  }

  return {
    primaryRecord,
    propagatedTargets,
    mandatoryFailures,
    secondaryFailures,
  };
}

/**
 * POST /api/jira/sync-comment
 * Sync a single comment to its linked ticket.
 */
app.post(
  "/api/jira/sync-comment",
  
  async (req: Request, res: Response) => {
    try {
      const { issueKey, commentBody, commentId = "", author = "Unknown", syncedBy, authorizedToPost = true } = req.body;

      if (!issueKey || !commentBody) {
        return res.status(400).json({ error: "issueKey and commentBody are required" });
      }

      if (!/#copycomment\b/i.test(commentBody)) {
        return res.status(400).json({ error: "No #copycomment hashtag found in comment" });
      }

      // Dedup by commentId
      if (commentId && isAlreadySynced(issueKey, commentId)) {
        return res.status(409).json({ error: "This comment has already been synced.", alreadySynced: true });
      }

      // Authorization check: frontend already validated this during discovery
      if (!authorizedToPost) {
        return res.status(403).json({
          error: "Not authorized to post this comment. Only the author, mentioned users, or board admins can sync.",
          authorized: false,
        });
      }

      const outcome = await internalSyncComment(req, issueKey, commentBody, commentId, author, syncedBy);
      res.json({
        success: outcome.primaryRecord.status === "success" && outcome.mandatoryFailures.length === 0,
        targetKey: outcome.primaryRecord.targetKey,
        transformedComment: outcome.primaryRecord.transformedComment,
        record: outcome.primaryRecord,
        propagatedTargets: outcome.propagatedTargets,
        mandatoryFailures: outcome.mandatoryFailures,
        secondaryFailures: outcome.secondaryFailures,
      });
    } catch (error) {
      console.error("[SYNC COMMENT ERROR]", error);
      const syncError = error as Error & {
        mandatoryFailures?: SyncTargetFailure[];
        secondaryFailures?: SyncTargetFailure[];
        propagatedTargets?: string[];
      };
      res.status(500).json({
        error: error instanceof Error ? error.message : "Comment sync failed",
        mandatoryFailures: syncError.mandatoryFailures || [],
        secondaryFailures: syncError.secondaryFailures || [],
        propagatedTargets: syncError.propagatedTargets || [],
      });
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
        propagatedTargets?: string[];
        mandatoryFailures?: SyncTargetFailure[];
        secondaryFailures?: SyncTargetFailure[];
      }> = [];

      for (const c of comments) {
        const { issueKey, commentBody, commentId = "", author = "Unknown", syncedBy } = c;

        if (commentId && isAlreadySynced(issueKey, commentId)) {
          results.push({ issueKey, commentId, status: "skipped", error: "Already synced" });
          continue;
        }

        try {
          const outcome = await internalSyncComment(req, issueKey, commentBody, commentId, author, syncedBy);
          results.push({
            issueKey,
            commentId,
            status: outcome.primaryRecord.status,
            targetKey: outcome.primaryRecord.targetKey,
            record: outcome.primaryRecord,
            propagatedTargets: outcome.propagatedTargets,
            mandatoryFailures: outcome.mandatoryFailures,
            secondaryFailures: outcome.secondaryFailures,
          });
        } catch (error) {
          const syncError = error as Error & {
            mandatoryFailures?: SyncTargetFailure[];
            secondaryFailures?: SyncTargetFailure[];
            propagatedTargets?: string[];
          };
          results.push({
            issueKey,
            commentId,
            status: "failed",
            error: error instanceof Error ? error.message : "Sync failed",
            propagatedTargets: syncError.propagatedTargets || [],
            mandatoryFailures: syncError.mandatoryFailures || [],
            secondaryFailures: syncError.secondaryFailures || [],
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
  
  async (req: Request, res: Response) => {
    try {
      const { days = 1, maxIssues = 200, projectKeys = [] } = req.body || {};
      const requestConfig = (req as any).jiraConfig as JiraConfig;
      const projects: string[] = Array.isArray(projectKeys) && projectKeys.length > 0
        ? projectKeys
        : ["Z10", "Z10LMC"]; // fallback if none provided

      const authHeader = `Basic ${Buffer.from(
        `${requestConfig.email}:${requestConfig.apiToken}`
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
            const url = new URL(`${requestConfig.instanceUrl}/rest/api/3/search/jql`);
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
      let currentUserDisplayName = "";
      await Promise.allSettled([
        makeJiraRequest(req, "GET", "/myself").then(async (r) => {
          if (r.ok) { const d = await r.json(); currentUserAccountId = d.accountId || ""; currentUserDisplayName = d.displayName || ""; }
        }),
        buildBoardAdminCache(projects, requestConfig),
      ]);

      const results: Array<{
        issueKey: string;
        targetKeys: string[];
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
          const commentsRes = await makeJiraRequest(req, "GET", `/issue/${key}?fields=comment,sprint,attachment,issuelinks`);
          if (!commentsRes.ok) return;
          const data = await commentsRes.json();
          const issueLinks: Array<{
            type?: { name?: string; inward?: string; outward?: string };
            outwardIssue?: { key: string };
            inwardIssue?: { key: string };
          }> = data.fields?.issuelinks || [];
          const targetKeys = extractCloneNeighborKeys(issueLinks, key);

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
            if (isJiraTriageSystemComment(text)) continue;
            const isCopyComment = /#copycomment\b/i.test(text);
            if (!isCopyComment) continue;
            if (isAlreadySynced(key, c.id)) continue;

            const isAuthor = c.author?.accountId === currentUserAccountId;
            const mentionAccountIds = extractMentionAccountIds(c.body);
            const mentionDisplayNames = extractMentions(c.body);
            const isMentionedByAccountId = mentionAccountIds.includes(currentUserAccountId);
            const isMentionedByName = mentionDisplayNames.some((m) => m.toLowerCase() === currentUserDisplayName.toLowerCase());
            const isMentioned = isMentionedByAccountId || isMentionedByName;
            let authorizedToPost: boolean;
            if (isAuthor) authorizedToPost = true;
            else if (isMentioned) authorizedToPost = true;
            else if (boardAdminMap.size === 0) authorizedToPost = true;
            else if (issueBoardId !== null) authorizedToPost = boardAdmins?.has(currentUserAccountId) ?? false;
            else authorizedToPost = false;

            console.log(`[AUTO-DISCOVER] ${key}::${c.id} | current user: "${currentUserDisplayName}" (${currentUserAccountId.slice(0, 8)}...) | mentions: [${mentionDisplayNames.join(", ")}] | isAuthor=${isAuthor}, isMentioned=${isMentioned}, authorized=${authorizedToPost}`);

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
                  url: `${requestConfig.instanceUrl}/secure/attachment/${att.id}/${encodeURIComponent(att.filename)}`,
                });
                mediaIdx++;
              }
            }

            results.push({
              issueKey: key,
              targetKeys,
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
  
  async (req: Request, res: Response) => {
    try {
      const { issueKeys } = req.body;
      const requestConfig = (req as any).jiraConfig as JiraConfig;
      if (!Array.isArray(issueKeys) || issueKeys.length === 0) {
        return res.status(400).json({ error: "issueKeys array is required" });
      }

      // Get current user + board admin cache in parallel
      let pollCurrentUserAccountId = "";
      let pollCurrentUserDisplayName = "";
      const pollProjects = [...new Set(issueKeys.map((k: string) => k.replace(/-\d+$/, "")))]; 
      await Promise.allSettled([
        makeJiraRequest(req, "GET", "/myself").then(async (r) => {
          if (r.ok) { const d = await r.json(); pollCurrentUserAccountId = d.accountId || ""; pollCurrentUserDisplayName = d.displayName || ""; }
        }),
        buildBoardAdminCache(pollProjects, requestConfig),
      ]);

      const results: Array<{
        issueKey: string;
        targetKeys: string[];
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
          const commentsRes = await makeJiraRequest(req, "GET", `/issue/${key}?fields=comment,sprint,attachment,issuelinks`);
          if (!commentsRes.ok) continue;
          const data = await commentsRes.json();
          const issueLinks: Array<{
            type?: { name?: string; inward?: string; outward?: string };
            outwardIssue?: { key: string };
            inwardIssue?: { key: string };
          }> = data.fields?.issuelinks || [];
          const targetKeys = extractCloneNeighborKeys(issueLinks, key);

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
            if (isJiraTriageSystemComment(text)) continue;
            const isCopyComment = /#copycomment\b/i.test(text);
            console.log(`[POLL] ${key} comment ${c.id} — text: "${text.slice(0, 150)}" | isCopyComment=${isCopyComment}`);
            if (!isCopyComment) continue;
            if (isAlreadySynced(key, c.id)) {
              console.log(`[POLL] Skipping ${key}::${c.id} — already synced`);
              continue;
            }

            const isAuthor = c.author?.accountId === pollCurrentUserAccountId;
            const mentionAccountIds = extractMentionAccountIds(c.body);
            const mentionDisplayNames = extractMentions(c.body);
            const isMentionedByAccountId = mentionAccountIds.includes(pollCurrentUserAccountId);
            const isMentionedByName = mentionDisplayNames.some((m) => m.toLowerCase() === pollCurrentUserDisplayName.toLowerCase());
            const isMentioned = isMentionedByAccountId || isMentionedByName;
            let authorizedToPost: boolean;
            if (isAuthor) authorizedToPost = true;
            else if (isMentioned) authorizedToPost = true;
            else if (boardAdminMap.size === 0) authorizedToPost = true;
            else if (issueBoardId !== null) authorizedToPost = boardAdmins?.has(pollCurrentUserAccountId) ?? false;
            else authorizedToPost = false;

            console.log(`[POLL-SYNC] ${key}::${c.id} | current user: "${pollCurrentUserDisplayName}" (${pollCurrentUserAccountId.slice(0, 8)}...) | mentions: [${mentionDisplayNames.join(", ")}] | isAuthor=${isAuthor}, isMentioned=${isMentioned}, authorized=${authorizedToPost}`);

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
                  url: `${requestConfig.instanceUrl}/secure/attachment/${att.id}/${encodeURIComponent(att.filename)}`,
                });
                mediaIdx++;
              }
            }

            results.push({
              issueKey: key,
              targetKeys,
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
app.get("/api/jira/sync-history",  (req: Request, res: Response) => {
  res.json({ history: syncHistory, total: syncHistory.length });
});

/**
 * GET /api/jira/sync-debug-logs
 * Return last N lines from sync-debug.log for troubleshooting.
 */
app.get("/api/jira/sync-debug-logs",  (req: Request, res: Response) => {
  try {
    const tailParam = Number(req.query.tail || 200);
    const tail = Number.isFinite(tailParam) ? Math.max(1, Math.min(2000, tailParam)) : 200;
    const exists = fs.existsSync(SYNC_LOG_FILE);
    if (!exists) {
      return res.json({ file: SYNC_LOG_FILE, lines: [], totalLines: 0 });
    }
    const raw = fs.readFileSync(SYNC_LOG_FILE, "utf-8");
    const allLines = raw.split(/\r?\n/).filter(Boolean);
    const lines = allLines.slice(-tail);
    res.json({ file: SYNC_LOG_FILE, lines, totalLines: allLines.length });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Failed to read sync logs" });
  }
});

/**
 * GET /api/jira/current-user
 * Returns the display name and email of the logged-in Jira user.
 */
app.get("/api/jira/current-user",  async (req: Request, res: Response) => {
  try {
    const response = await makeJiraRequest(req, "GET", "/myself");
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
