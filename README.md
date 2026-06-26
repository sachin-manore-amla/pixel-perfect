# JiraTriage

JiraTriage is a React + Vite + Express application used for Jira triage, project insights, and comment-sync workflows.

## Development

```powershell
npm install
npm run dev:all
```

## Security Review Policy

All code changes, including AI-assisted code, must pass a mandatory security review before production deployment.

- Required checklist: `SECURITY_REVIEW_CHECKLIST.md`
- CI security pipeline: `.github/workflows/security.yml`

Minimum review scope includes:

- Authentication and authorization
- CORS policy and browser security headers
- Input validation and error handling
- Rate limiting and abuse controls
- Secret management and logging hygiene

## Security Smoke Test

Run the quick verification script after backend changes:

```powershell
cd D:\10X\Ideafest
.\security-smoke-test.ps1 -BaseUrl "http://localhost:3001" -JiraUrl "https://<your-instance>.atlassian.net" -JiraEmail "<email>" -JiraToken "<token>"
```

Dry-run mode (validate script flow without sending requests):

```powershell
cd D:\10X\Ideafest
.\security-smoke-test.ps1 -DryRun
```
