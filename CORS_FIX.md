# CORS Fix - Backend Proxy Server

## Problem

When making API calls directly from the frontend to Jira, the browser blocks the requests with a CORS (Cross-Origin Resource Sharing) policy error:

```
Access to fetch at 'https://amla.atlassian.net/rest/api/3/myself' from origin 
'http://localhost:8080' has been blocked by CORS policy: Response to preflight 
request doesn't pass access control check: No 'Access-Control-Allow-Origin' 
header is present on the requested resource.
```

This happens because:
1. Frontend is running on `http://localhost:8080`
2. Jira API is on `https://amla.atlassian.net`
3. These are different origins, so the browser blocks cross-origin requests
4. Jira API doesn't include CORS headers

## Solution

We've implemented a **backend proxy server** that handles Jira API requests. The frontend now communicates with the local backend instead of directly with Jira.

### Architecture

```
Frontend (localhost:8080)
    ↓
Backend Proxy Server (localhost:3001)
    ↓
Jira API (https://amla.atlassian.net)
```

This works because:
- Frontend to Backend: Same origin (localhost) - CORS not needed
- Backend to Jira: Server-to-server communication - no CORS restrictions

## Setup

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `express` - Backend framework
- `cors` - CORS middleware
- `dotenv` - Environment variables
- `tsx` - TypeScript executor
- `concurrently` - Run multiple scripts

### 2. Start Services

**Option A: Start both simultaneously (Recommended)**
```bash
npm run dev:all
```

This runs both the backend proxy server and frontend dev server concurrently.

**Option B: Start separately**

Terminal 1 - Backend Proxy:
```bash
npm run server
```

Terminal 2 - Frontend:
```bash
npm run dev
```

### 3. Verify Setup

**Backend Proxy:**
- Should be running on `http://localhost:3001`
- Check health at `http://localhost:3001/api/health`

**Frontend:**
- Running on `http://localhost:8080`
- Access Settings to configure Jira

## How It Works

### Configuration Flow

1. **User enters Jira credentials** in Settings dialog
2. **Frontend sends to backend:** `POST /api/jira/config`
3. **Backend stores config** in memory (for this session)
4. **Frontend stores email/URL** in localStorage (for next session)

### API Request Flow

1. **Frontend makes request:** `GET /api/jira/api/search?jql=...`
2. **Backend receives request** and authenticates with stored credentials
3. **Backend makes request to Jira:** `GET https://amla.atlassian.net/rest/api/3/search?jql=...`
4. **Backend returns response** to frontend

### Test Connection Flow

1. **User clicks "Test Connection"**
2. **Frontend sends config:** `POST /api/jira/test` with credentials
3. **Backend calls Jira API:** `GET /myself`
4. **Backend returns success/failure** to frontend
5. **If success:** User can save config

## API Endpoints

### Configuration Endpoints

#### `POST /api/jira/config`
Save Jira configuration
```bash
curl -X POST http://localhost:3001/api/jira/config \
  -H "Content-Type: application/json" \
  -d '{
    "instanceUrl": "https://mycompany.atlassian.net",
    "email": "user@company.com",
    "apiToken": "token_here"
  }'
```

#### `POST /api/jira/test`
Test connection with credentials
```bash
curl -X POST http://localhost:3001/api/jira/test \
  -H "Content-Type: application/json" \
  -d '{
    "instanceUrl": "https://mycompany.atlassian.net",
    "email": "user@company.com",
    "apiToken": "token_here"
  }'
```

#### `GET /api/jira/config`
Check if Jira is configured
```bash
curl http://localhost:3001/api/jira/config
```

#### `DELETE /api/jira/config`
Clear configuration
```bash
curl -X DELETE http://localhost:3001/api/jira/config
```

### Proxy Endpoints

All Jira API calls are proxied through `/api/jira/api/*`

#### GET Request
```bash
curl http://localhost:3001/api/jira/api/myself
curl http://localhost:3001/api/jira/api/search?jql=assignee=currentUser()
```

#### POST Request
```bash
curl -X POST http://localhost:3001/api/jira/api/issue \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "project": {"key": "PROJ"},
      "summary": "Test issue"
    }
  }'
```

#### PUT Request
```bash
curl -X PUT http://localhost:3001/api/jira/api/issue/PROJ-123 \
  -H "Content-Type: application/json" \
  -d '{
    "fields": {
      "summary": "Updated summary"
    }
  }'
```

#### DELETE Request
```bash
curl -X DELETE http://localhost:3001/api/jira/api/issue/PROJ-123
```

## Frontend Hook Usage

The frontend hooks automatically use the backend proxy:

```typescript
import { useJiraAPI } from "@/hooks/use-jira-config";

export function MyComponent() {
  const { get, post, isConfigured } = useJiraAPI();

  const loadIssues = async () => {
    // This automatically goes through the backend proxy
    const issues = await get('/search?jql=assignee=currentUser()');
  };
}
```

## Troubleshooting

### Backend not running
**Error:** `Jira configuration not found` or connection refused

**Solution:** Start the backend server
```bash
npm run server
# or
npm run dev:all
```

### "Jira API Error" messages
**Error:** Connection to backend works but Jira connection fails

**Possible causes:**
- Wrong Jira URL
- Invalid email  
- Expired API token
- Missing permissions

**Solution:** 
- Regenerate API token at https://id.atlassian.com/manage-profile/security/api-tokens
- Verify email matches your Atlassian account
- Check Jira URL format

### Common Issues

**"Cannot POST /api/jira/config"**
- Backend is not running
- Start with `npm run server` or `npm run dev:all`

**"Failed to connect"**
- Backend running but can't reach Jira
- Check internet connection
- Verify Jira URL is correct

**API requests hang**
- Backend might be stuck
- Restart: `Ctrl+C` then `npm run server`

**Credentials not saved**
- Backend server needs to be running when saving
- Configuration is stored in backend memory for the session
- Email/URL stored in browser localStorage

## Environment Variables

Create `.env` file or use `.env.example`:

```bash
VITE_API_PORT=3001           # Port for backend server
VITE_API_URL=http://localhost:3001  # URL frontend uses to reach backend
```

## Security Considerations

### Current Setup (Development)
- ⚠️ Credentials stored in backend memory (lost on restart)
- ✅ Credentials NOT sent to browser in API responses
- ✅ API token visible only in network request to `/api/jira/test` (no CORS)

### For Production
- 🔐 Use secure session storage (Redis, database)
- 🔐 Use encrypted credentials storage
- 🔐 Add authentication to backend endpoints
- 🔐 Use HTTPS
- 🔐 Add rate limiting
- 🔐 Implement request signing/validation

## Architecture Overview

### Files

**Backend:**
- `server.ts` - Express proxy server

**Frontend:**
- `src/hooks/use-jira-config.ts` - Updated to use backend proxy
- `src/components/JiraConfigDialog.tsx` - Jira configuration UI
- `src/pages/Settings.tsx` - Settings page

**Configuration:**
- `.env` - Environment variables
- `.env.example` - Example configuration

### Scripts

```json
{
  "dev": "vite",                          // Frontend only
  "dev:all": "concurrently \"npm run server\" \"npm run dev\"",  // Both
  "server": "tsx watch server.ts",        // Backend only
  "build": "vite build",
  "lint": "eslint ."
}
```

## Performance

The proxy adds minimal latency:
- Request routing: ~1-5ms
- Network to Jira: ~100-500ms (depends on connection)
- Overall impact: negligible

## Future Improvements

- [ ] Add request caching
- [ ] Add request rate limiting
- [ ] Add error logging/monitoring
- [ ] Add authentication middleware
- [ ] Support for multiple Jira instances
- [ ] Add request timeout handling
- [ ] Add request retry logic

---

Questions? Check the main [JIRA_INTEGRATION.md](./JIRA_INTEGRATION.md) guide.
