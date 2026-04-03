# CORS Fix - Quick Start Guide ✅

## What's Fixed

The CORS error is now resolved! Here's what was implemented:

1. **Backend Proxy Server** (`server.ts`) - Handles Jira API requests
2. **Updated Frontend Hooks** - Now use the backend proxy instead of direct API calls
3. **Configuration Management** - Backend stores credentials securely in memory

## Running the Application

### Start Everything (Recommended)

```bash
npm run dev:all
```

This starts:
- ✅ Backend proxy on `http://localhost:3001`
- ✅ Frontend on `http://localhost:8081` (or next available port)

### Or Start Separately

**Terminal 1 - Backend:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

## Using Jira Integration

### 1. Open the App
Go to `http://localhost:8081` (or the displayed URL)

### 2. Configure Jira
- Click the **Settings icon (⚙️)** in the sidebar footer
- Enter your Jira Cloud URL (e.g., `https://mycompany.atlassian.net`)
- Enter your email
- Get your API token from https://id.atlassian.com/manage-profile/security/api-tokens
- Click **"Test Connection"** to verify
- Click **"Save Configuration"**

### 3. Use Jira APIs
In your components, use the hooks:

```typescript
import { useJiraAPI } from "@/hooks/use-jira-config";

export function MyComponent() {
  const { get, post, isConfigured } = useJiraAPI();

  const loadIssues = async () => {
    // Automatically routes through backend proxy
    const result = await get('/search?jql=assignee=currentUser()');
    console.log(result);
  };

  if (!isConfigured) return <p>Configure Jira first</p>;

  return <button onClick={loadIssues}>Load Issues</button>;
}
```

## How It Works

```
Your Browser (http://localhost:8081)
    ↓ (Same origin - no CORS)
Backend Proxy (http://localhost:3001)
    ↓ (Server-to-server - no CORS restrictions)
Jira API (https://your-domain.atlassian.net)
```

## API Flow

1. **Frontend** makes request: `GET /api/jira/api/search?jql=...`
2. **Backend** receives and authenticates with stored Jira credentials
3. **Backend** forwards to Jira: `GET https://your-domain.atlassian.net/rest/api/3/search?jql=...`
4. **Jira** responds, **Backend** relays to **Frontend**

## Available Endpoints

All Jira REST API v3 endpoints are available through the proxy:

```typescript
const { get, post, put, patch, delete: del } = useJiraAPI();

// Get endpoints
await get('/myself');                                    // Current user
await get('/search?jql=assignee=currentUser()');       // Search issues
await get('/issue/PROJ-123');                          // Get issue details

// Post endpoints  
await post('/issue', { fields: {...} });               // Create issue
await post('/issue/PROJ-123/transitions', {...});      // Transition issue
await post('/issue/PROJ-123/comments', {...});         // Add comment

// Put endpoints
await put('/issue/PROJ-123', { fields: {...} });       // Update issue

// Delete endpoints
await del('/issue/PROJ-123');                          // Delete issue
```

For full API reference: https://developer.atlassian.com/cloud/jira/rest/v3/

## Troubleshooting

### "Connection failed" after saving config
- ✅ Backend is running on port 3001? Check terminal
- ✅ Jira credentials correct? 
- ✅ Internet connection working?
- ✅ Jira URL format correct? Should be `https://your-domain.atlassian.net`

### Port 8080 in use
- Frontend automatically uses next available port (8081, 8082, etc.)
- Check the terminal output for the actual URL

### Changes to hooks not updating
- Save `use-jira-config.ts`
- Frontend auto-reloads with hot module replacement
- If not: refresh browser

### Backend errors
- Check terminal output for error messages
- Restart with `Ctrl+C` and `npm run dev:all`

## Documentation

- 📖 [JIRA_INTEGRATION.md](./JIRA_INTEGRATION.md) - Complete Jira integration guide
- 📖 [CORS_FIX.md](./CORS_FIX.md) - Technical CORS fix details
- 📖 [SETUP_COMPLETE.md](./SETUP_COMPLETE.md) - Initial setup reference

## Next Steps

1. ✅ Start the app with `npm run dev:all`
2. ✅ Go to Settings (gear icon)
3. ✅ Configure your Jira instance
4. ✅ Test the connection
5. ✅ Save configuration
6. ✅ Check out Settings page for live API examples
7. ✅ Start building with the Jira API hooks!

---

**Everything is ready!** The CORS issue is fixed and your Jira integration is fully functional. 🎉

Need help? Check the detailed docs or look at the example components in `src/components/JiraApiExample.tsx`.
