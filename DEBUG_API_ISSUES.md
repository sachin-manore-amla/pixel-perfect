# API Debugging: Why Postman Works But App Doesn't

## 🔍 POTENTIAL ISSUES FOUND

### 1. **Backend Not Receiving Jira Config in Memory** 
**Status**: 🔴 HIGH PROBABILITY
- Backend stores config in RAM: `let jiraConfig: JiraConfig | null = null;`
- When backend starts fresh, jiraConfig is empty
- Frontend saves to localStorage (client-side), but backend doesn't have it in memory until you manually save via Settings dialog
- **Fix**: Frontend must explicitly call `/api/jira/config` POST endpoint after loading to sync with backend

### 2. **Port Conflict - Backend Not Running**
**Status**: 🔴 BLOCKING
- Check if port 3001 is already in use
- Old npm process might still be running
- **Fix**: Kill all Node processes: `taskkill /F /IM node.exe /T`

### 3. **localStorage vs Backend Memory Mismatch**
**Status**: 🟡 MEDIUM PROBABILITY
- Frontend loads config from localStorage in useJiraConfig
- But backend has separate in-memory storage
- They can get out of sync if backend restarts or wasn't initialized
- **Fix**: Add auto-sync on app load

### 4. **URL Query String Encoding Issues**
**Status**: 🔴 LIKELY CULPRIT
- Complex JQL with special characters: `"Tags[Short text]"`, spaces, quotes, parentheses
- encodeURIComponent() might not handle all edge cases
- URL regex extraction: `/^\/api\/jira\/api(.*)$/` captures everything including encoded query
- But makeJiraRequest might double-encode
- **Fix**: Need to verify query string is passed correctly to Jira

### 5. **Missing/Incorrect Headers**
**Status**: 🟡 MEDIUM PROBABILITY
- Postman includes: Authorization, Cookie, User-Agent, Accept-Language
- Backend only adds: Authorization, Content-Type
- Backend strips cookies and other headers
- **Fix**: Preserve more headers in proxy

### 6. **Authorization Header Format**
**Status**: 🟢 LOW PROBABILITY (Already implemented correctly)
- Backend correctly creates: `Basic ${Buffer.from(email:apiToken).toString('base64')}`
- But worth verifying the encoded credentials are correct

### 7. **CORS Headers Missing**
**Status**: 🟢 LOW PROBABILITY
- Backend has `app.use(cors())` middleware
- Should be fine for frontend requests

---

## 📋 STEP-BY-STEP DEBUGGING GUIDE

### Step 1: Kill All Processes & Clean Start
```powershell
# Kill all Node.js processes
taskkill /F /IM node.exe /T

# Wait 2 seconds
Start-Sleep -Seconds 2

# Start fresh
npm run dev:all
```

### Step 2: Open Browser Console
1. Open DevTools: `F12`
2. Go to **Network** tab
3. Filter by `/api/jira`
4. Trigger P1 Bucket load

### Step 3: Check Each Network Request
For request `GET http://localhost:3001/api/jira/api/search?jql=...`

**Check Response Headers:**
- Status: Should be `200` not `400` or `500`
- `content-type: application/json`

**Check Response Body:**
- Look for error message
- Should contain `issues: [...]` array

### Step 4: Check Backend Console
Look for:
```
[PROXY GET] Endpoint: /search?jql=project%20...
```

- If you DON'T see this, request never reached backend
- If you see error after it, check the error message

### Step 5: Verify Jira Config is Saved
Go to Settings → Jira Config
- Test Connection button
- Should return "Connection successful"
- This confirms backend has config in memory

### Step 6: Check Postman vs Browser Request
**In Postman:**
- Authorization header is set manually
- Request completes successfully
- Status: 200

**In Browser:**
- Frontend sends to: `http://localhost:3001/api/jira/api/search?jql=...`
- Backend should forward to: `https://amla.atlassian.net/rest/api/3/search?jql=...`
- WITH Authorization header added by backend

---

## 🐛 MOST LIKELY ROOT CAUSE

**Backend is returning 400 error from requireJiraConfig middleware**

This happens when:
1. ✗ Backend was never started, OR
2. ✗ Backend started but Jira config was never saved to memory, OR
3. ✗ Backend restarted and lost the in-memory config

**Quick Test:**
1. Go to Settings page
2. Enter your Jira credentials
3. Click "Test Connection" - it should say "Connection successful"
4. NOW try P1 Bucket - should load data

If Test Connection fails → Authorization header format is wrong
If Test Connection succeeds → Config is in backend memory
If P1 Bucket STILL fails after successful test → URL parsing is broken

---

## 🔧 RECOMMENDED FIXES

### Fix A: Auto-Sync Config on App Load (RECOMMENDED)
Add to `src/hooks/use-jira-config.ts`:
```typescript
useEffect(() => {
  // After loading config from localStorage, sync to backend
  if (config && !backend.isInitialized) {
    fetch('http://localhost:3001/api/jira/config', {
      method: 'POST',
      body: JSON.stringify(config),
      headers: { 'Content-Type': 'application/json' }
    }).catch(console.error);
  }
}, [config]);
```

### Fix B: Improve Backend URL Handling
Current `makeJiraRequest()` creates URL as:
```javascript
const url = `${jiraConfig.instanceUrl}/rest/api/3${endpoint}`;
```

If endpoint is `/search?jql=...` it becomes:
```
https://amla.atlassian.net/rest/api/3/search?jql=...
```

This should be correct, but need to verify query params aren't getting double-encoded.

### Fix C: Add Better Logging
Update route handler to log:
```typescript
console.log('[PROXY GET]', {
  originalUrl: req.originalUrl,
  extractedEndpoint: endpoint,
  finalJiraUrl: `${jiraConfig.instanceUrl}/rest/api/3${endpoint}`
});
```

---

## 📊 TEST MATRIX

| Component | Status | Works | Issue |
|-----------|--------|-------|-------|
| Backend Running | ❓ | ? | Port 3001 in use? |
| Jira Config Saved | ❓ | ? | In-memory storage empty? |
| Test Connection | ❓ | ? | Auth header format? |
| URL Encoding | ❓ | ? | Special chars broken? |
| Headers Passed | ❓ | ? | Missing auth? |
| Jira Response | ❓ | ? | 200 or 401/410? |

---

## 🚀 ACTION ITEMS

1. Kill all Node processes: `taskkill /F /IM node.exe /T`
2. Start fresh: `npm run dev:all`
3. Go to Settings, enter Jira credentials, click "Test Connection"
4. Check browser DevTools Network tab
5. Report what status code you see on `/api/jira/api/search` request
6. Report any error messages from backend console
