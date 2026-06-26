# Jira Integration Guide

This project includes a built-in Jira Cloud API integration system with authentication and easy-to-use hooks.

## Table of Contents

- [Setup](#setup)
- [Configuration](#configuration)
- [Using the Hooks](#using-the-hooks)
- [Examples](#examples)
- [API Reference](#api-reference)

## Setup

### 1. Configure Your Jira Instance

1. Click the **Settings** icon (gear icon) in the sidebar footer
2. Fill in your Jira instance details:
   - **Jira Instance URL**: Your Atlassian cloud URL (e.g., `https://mycompany.atlassian.net`)
   - **Email**: Your Atlassian account email
   - **API Token**: Your Jira API token (get it from [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens))
3. Click "Test Connection" to verify the connection
4. Click "Save Configuration" to store your credentials

Your credentials are stored in browser localStorage and are used for all API requests.

## Configuration

### Getting Your API Token

1. Go to [Atlassian Account Settings](https://id.atlassian.com/manage-profile/security/api-tokens)
2. Click "Create API token"
3. Give it a memorable name and click "Create"
4. Copy the generated token immediately (you won't be able to see it again)
5. Paste it in the Jira Configuration dialog

### Clearing Configuration

If you need to remove your stored configuration:
1. Open the Jira Configuration dialog (Settings icon in sidebar)
2. Click the "Clear" button

## Using the Hooks

### useJiraConfig Hook

Manages Jira configuration storage and testing.

```typescript
import { useJiraConfig } from "@/hooks/use-jira-config";

export function MyComponent() {
  const { config, saveConfig, clearConfig, testConnection } = useJiraConfig();

  // Check if config exists
  if (config) {
    console.log("Jira configured:", config.instanceUrl);
  }

  // Save new configuration
  const saveNewConfig = async () => {
    saveConfig({
      instanceUrl: "https://mycompany.atlassian.net",
      email: "user@company.com",
      apiToken: "your-api-token",
    });
  };

  // Test connection
  const testConn = async () => {
    const success = await testConnection(config);
    console.log("Connection test:", success);
  };

  // Clear configuration
  const clearConn = () => {
    clearConfig();
  };
}
```

### useJiraAPI Hook

Makes authenticated API calls to Jira.

```typescript
import { useJiraAPI } from "@/hooks/use-jira-config";

export function MyComponent() {
  const { get, post, put, patch, delete: del, isConfigured } = useJiraAPI();

  if (!isConfigured) {
    return <p>Jira not configured</p>;
  }

  // Fetch user data
  const fetchUser = async () => {
    const user = await get("/myself");
  };

  // Search for issues
  const searchIssues = async () => {
    const result = await get('/search?jql=status="In Progress"');
  };

  // Create an issue
  const createIssue = async () => {
    const newIssue = await post("/issue", {
      fields: {
        project: { key: "PROJ" },
        summary: "New Task",
        description: "Task description",
        issuetype: { name: "Task" },
      },
    });
  };
}
```

## Examples

### Fetch Current User

```typescript
async function getCurrentUser() {
  const { get } = useJiraAPI();
  const user = await get("/myself");
  console.log(user.displayName);
}
```

### Search Issues

```typescript
async function searchIssues(jql: string) {
  const { get } = useJiraAPI();
  const result = await get(`/search?jql=${encodeURIComponent(jql)}`);
  return result.issues;
}

// Usage:
const issues = await searchIssues('assignee = currentUser() AND status = "In Progress"');
```

### Create an Issue

```typescript
async function createTask(projectKey: string, summary: string) {
  const { post } = useJiraAPI();
  const issue = await post("/issue", {
    fields: {
      project: { key: projectKey },
      summary: summary,
      description: "Created from JiraTriage dashboard",
      issuetype: { name: "Task" },
      priority: { name: "Medium" },
    },
  });
  return issue;
}
```

### Transition an Issue

```typescript
async function transitionIssue(issueKey: string, transitionId: string) {
  const { post } = useJiraAPI();
  await post(`/issue/${issueKey}/transitions`, {
    transition: { id: transitionId },
  });
}
```

### Update an Issue

```typescript
async function updateIssue(issueKey: string, updateData: unknown) {
  const { put } = useJiraAPI();
  await put(`/issue/${issueKey}`, {
    fields: updateData,
  });
}
```

### Add Comment to Issue

```typescript
async function addComment(issueKey: string, comment: string) {
  const { post } = useJiraAPI();
  await post(`/issue/${issueKey}/comments`, {
    body: {
      type: "doc",
      version: 1,
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: comment,
            },
          ],
        },
      ],
    },
  });
}
```

## API Reference

All API endpoints follow the Jira Cloud REST API v3 format. The base path `/rest/api/3` is automatically prepended.

### Available Methods

#### `get<T>(endpoint: string): Promise<T>`
Makes a GET request to the Jira API.

**Parameters:**
- `endpoint` - API endpoint path (e.g., `/myself`, `/search?jql=...`)

**Returns:** Promise containing the API response

**Example:**
```typescript
const user = await get("/myself");
```

#### `post<T>(endpoint: string, body: unknown): Promise<T>`
Makes a POST request to the Jira API.

**Parameters:**
- `endpoint` - API endpoint path
- `body` - Request payload

**Returns:** Promise containing the API response

**Example:**
```typescript
const issue = await post("/issue", { fields: {...} });
```

#### `put<T>(endpoint: string, body: unknown): Promise<T>`
Makes a PUT request to the Jira API.

#### `patch<T>(endpoint: string, body: unknown): Promise<T>`
Makes a PATCH request to the Jira API.

#### `delete<T>(endpoint: string): Promise<T>`
Makes a DELETE request to the Jira API.

#### `request<T>(endpoint: string, options: RequestInit): Promise<T>`
Makes any type of HTTP request with custom options.

### Configuration Status

- `isConfigured: boolean` - Returns `true` if Jira is configured, `false` otherwise

## Authentication

Authentication uses HTTP Basic Auth with your email and API token encoded in Base64. This is handled automatically by the hooks.

**Note:** Make sure to use HTTPS for all connections. Never expose your API token in public repositories.

## Error Handling

API errors are thrown as Error objects with detailed messages:

```typescript
try {
  const issue = await get("/issue/INVALID");
} catch (error) {
  console.error(error.message); // "Jira API Error: 404 Not Found. ..."
}
```

## Common Issues

### "Jira configuration not found"
- Open Settings > Jira Integration
- Configure your Jira instance
- Test the connection

### "401 Unauthorized"
- Verify your API token is correct
- Check that your email matches your Atlassian account
- Generate a new token if the current one is expired

### "Invalid Jira instance URL"
- Ensure the URL starts with `https://`
- Verify the domain is correct
- Remove any trailing slashes

## Documentation Links

- [Jira Cloud REST API v3](https://developer.atlassian.com/cloud/jira/rest/v3/api-group-issues/)
- [Atlassian API Authentication](https://developer.atlassian.com/cloud/jira/platform/basic-auth-for-rest-apis/)
- [JQL Search Guide](https://support.atlassian.com/jira-software-cloud/docs/what-is-advanced-search-with-jql/)
