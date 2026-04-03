import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import dotenv from "dotenv";

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
): Promise<Response> {
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

      if (response.ok) {
        res.json({ success: true, message: "Connection successful" });
      } else {
        res.status(response.status).json({
          success: false,
          error: `Jira API returned ${response.status}`,
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

// Health check
app.get("/api/health", (req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Jira API Proxy Server running on http://localhost:${PORT}`);
  console.log(`API routes available at http://localhost:${PORT}/api/jira`);
});
