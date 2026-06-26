param(
  [string]$BaseUrl = "http://localhost:3001",
  [string]$JiraUrl,
  [string]$JiraEmail,
  [string]$JiraToken,
  [string]$UntrustedOrigin = "https://evil.com",
  [int]$RateLimitProbeCount = 40,
  [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function New-Result {
  param(
    [string]$Finding,
    [string]$Test,
    [bool]$Passed,
    [string]$Details
  )

  [PSCustomObject]@{
    Finding = $Finding
    Test    = $Test
    Passed  = $Passed
    Details = $Details
  }
}

function Write-Section {
  param([string]$Text)
  Write-Host "`n=== $Text ===" -ForegroundColor Cyan
}

function Read-ResponseBody {
  param($Response)

  if (-not $Response) { return "" }

  try {
    $stream = $Response.GetResponseStream()
    if (-not $stream) { return "" }
    $reader = New-Object System.IO.StreamReader($stream)
    $content = $reader.ReadToEnd()
    $reader.Close()
    return $content
  } catch {
    return ""
  }
}

function Invoke-HttpDetailed {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST", "OPTIONS")] [string]$Method,
    [Parameter(Mandatory = $true)][string]$Uri,
    [hashtable]$Headers,
    [string]$Body
  )

  if ($DryRun) {
    return [PSCustomObject]@{
      StatusCode = 0
      Headers    = @{}
      Body       = "[DryRun]"
      Error      = $null
      Uri        = $Uri
      Method     = $Method
    }
  }

  try {
    $invokeParams = @{
      Uri         = $Uri
      Method      = $Method
      Headers     = $Headers
      ErrorAction = "Stop"
    }

    if ($Method -eq "POST" -and $Body) {
      $invokeParams["Body"] = $Body
      if (-not $Headers.ContainsKey("Content-Type")) {
        $invokeParams["ContentType"] = "application/json"
      }
    }

    $resp = Invoke-WebRequest @invokeParams

    return [PSCustomObject]@{
      StatusCode = [int]$resp.StatusCode
      Headers    = $resp.Headers
      Body       = $resp.Content
      Error      = $null
      Uri        = $Uri
      Method     = $Method
    }
  }
  catch [System.Net.WebException] {
    $webEx = $_.Exception
    $response = $webEx.Response

    if ($response) {
      return [PSCustomObject]@{
        StatusCode = [int]$response.StatusCode
        Headers    = $response.Headers
        Body       = (Read-ResponseBody -Response $response)
        Error      = $webEx.Message
        Uri        = $Uri
        Method     = $Method
      }
    }

    return [PSCustomObject]@{
      StatusCode = -1
      Headers    = @{}
      Body       = ""
      Error      = $webEx.Message
      Uri        = $Uri
      Method     = $Method
    }
  }
}

function Get-HeaderValue {
  param(
    $Headers,
    [string]$Name
  )

  if (-not $Headers) { return $null }

  try {
    $value = $Headers[$Name]
    if ($value) { return [string]$value }

    foreach ($key in $Headers.Keys) {
      if ($key -ieq $Name) {
        return [string]$Headers[$key]
      }
    }
  } catch {}

  return $null
}

$results = New-Object System.Collections.Generic.List[object]

Write-Section "Health Check"
$health = Invoke-HttpDetailed -Method GET -Uri "$BaseUrl/api/health" -Headers @{}

if ($DryRun) {
  Write-Host "Dry run mode: request execution skipped." -ForegroundColor Yellow
} elseif ($health.StatusCode -lt 0) {
  Write-Host "Cannot reach $BaseUrl. Start the backend before running this script." -ForegroundColor Red
  exit 1
}

$authHeaders = @{}
$hasAuthInputs = -not [string]::IsNullOrWhiteSpace($JiraUrl) -and -not [string]::IsNullOrWhiteSpace($JiraEmail) -and -not [string]::IsNullOrWhiteSpace($JiraToken)
if ($hasAuthInputs) {
  $authHeaders = @{
    "X-Jira-Url"   = $JiraUrl
    "X-Jira-Email" = $JiraEmail
    "X-Jira-Token" = $JiraToken
  }
}

Write-Section "F-01 Authentication Enforcement"
$unauthCurrentUser = Invoke-HttpDetailed -Method GET -Uri "$BaseUrl/api/jira/current-user" -Headers @{}
$results.Add((New-Result -Finding "F-01" -Test "Unauthenticated /api/jira/current-user is denied" -Passed ($unauthCurrentUser.StatusCode -eq 401) -Details "HTTP $($unauthCurrentUser.StatusCode)"))

Write-Section "F-02 CORS Policy"
$preflightHeaders = @{
  "Origin"                        = $UntrustedOrigin
  "Access-Control-Request-Method" = "GET"
  "Access-Control-Request-Headers"= "Authorization"
}
$preflight = Invoke-HttpDetailed -Method OPTIONS -Uri "$BaseUrl/api/jira/projects" -Headers $preflightHeaders
$allowOrigin = Get-HeaderValue -Headers $preflight.Headers -Name "Access-Control-Allow-Origin"
$results.Add((New-Result -Finding "F-02" -Test "Wildcard CORS is not returned to untrusted origin" -Passed ($allowOrigin -ne "*") -Details "Access-Control-Allow-Origin='$allowOrigin'"))

Write-Section "F-03 + F-05 Search Controls"
if ($hasAuthInputs) {
  $searchHeaders = @{
    "Content-Type" = "application/json"
  } + $authHeaders

  $unscopedJqlBody = '{"jql":"created >= -7d ORDER BY created DESC","maxResults":5}'
  $unscopedResp = Invoke-HttpDetailed -Method POST -Uri "$BaseUrl/api/jira/search" -Headers $searchHeaders -Body $unscopedJqlBody
  $results.Add((New-Result -Finding "F-03" -Test "Unscoped JQL is rejected" -Passed ($unscopedResp.StatusCode -eq 400 -or $unscopedResp.StatusCode -eq 403) -Details "HTTP $($unscopedResp.StatusCode)"))

  $badSyntaxBody = '{"jql":"project = ABC AND INVALID_SYNTAX ;;;","maxResults":1}'
  $badSyntaxResp = Invoke-HttpDetailed -Method POST -Uri "$BaseUrl/api/jira/search" -Headers $searchHeaders -Body $badSyntaxBody
  $leaksParserDetails = ($badSyntaxResp.Body -match "line\s+\d+" -or $badSyntaxResp.Body -match "reserved JQL character" -or $badSyntaxResp.Body -match "errorMessages")
  $results.Add((New-Result -Finding "F-05" -Test "JQL parser details are sanitized" -Passed (-not $leaksParserDetails) -Details "HTTP $($badSyntaxResp.StatusCode); body='$($badSyntaxResp.Body)'"))
}
else {
  $results.Add((New-Result -Finding "F-03" -Test "Unscoped JQL is rejected" -Passed $false -Details "Skipped: provide -JiraUrl -JiraEmail -JiraToken"))
  $results.Add((New-Result -Finding "F-05" -Test "JQL parser details are sanitized" -Passed $false -Details "Skipped: provide -JiraUrl -JiraEmail -JiraToken"))
}

Write-Section "F-06 Rate Limiting"
if ($hasAuthInputs) {
  $rateLimited = $false
  $sawHeaders = $false
  for ($i = 1; $i -le $RateLimitProbeCount; $i++) {
    $resp = Invoke-HttpDetailed -Method GET -Uri "$BaseUrl/api/jira/projects" -Headers $authHeaders
    $limitHeader = Get-HeaderValue -Headers $resp.Headers -Name "X-RateLimit-Limit"
    $remainingHeader = Get-HeaderValue -Headers $resp.Headers -Name "X-RateLimit-Remaining"
    if ($limitHeader -or $remainingHeader) { $sawHeaders = $true }
    if ($resp.StatusCode -eq 429) {
      $rateLimited = $true
      break
    }
  }

  $results.Add((New-Result -Finding "F-06" -Test "Rate limiting returns 429 under burst traffic" -Passed $rateLimited -Details "Probes=$RateLimitProbeCount"))
  $results.Add((New-Result -Finding "F-06" -Test "Rate limit headers are present" -Passed $sawHeaders -Details "Checked X-RateLimit-* headers"))
}
else {
  $results.Add((New-Result -Finding "F-06" -Test "Rate limiting returns 429 under burst traffic" -Passed $false -Details "Skipped: provide -JiraUrl -JiraEmail -JiraToken"))
  $results.Add((New-Result -Finding "F-06" -Test "Rate limit headers are present" -Passed $false -Details "Skipped: provide -JiraUrl -JiraEmail -JiraToken"))
}

Write-Section "F-07 + Security Headers"
$headerProbe = Invoke-HttpDetailed -Method GET -Uri "$BaseUrl/api/health" -Headers @{}
$xPoweredBy = Get-HeaderValue -Headers $headerProbe.Headers -Name "X-Powered-By"
$csp = Get-HeaderValue -Headers $headerProbe.Headers -Name "Content-Security-Policy"
$hsts = Get-HeaderValue -Headers $headerProbe.Headers -Name "Strict-Transport-Security"
$nosniff = Get-HeaderValue -Headers $headerProbe.Headers -Name "X-Content-Type-Options"
$permissions = Get-HeaderValue -Headers $headerProbe.Headers -Name "Permissions-Policy"

$results.Add((New-Result -Finding "F-07" -Test "Express X-Powered-By is disabled" -Passed ([string]::IsNullOrWhiteSpace($xPoweredBy)) -Details "X-Powered-By='$xPoweredBy'"))
$results.Add((New-Result -Finding "Headers" -Test "Content-Security-Policy present" -Passed (-not [string]::IsNullOrWhiteSpace($csp)) -Details "CSP='$csp'"))
$results.Add((New-Result -Finding "Headers" -Test "Strict-Transport-Security present" -Passed (-not [string]::IsNullOrWhiteSpace($hsts)) -Details "HSTS='$hsts'"))
$results.Add((New-Result -Finding "Headers" -Test "X-Content-Type-Options present" -Passed ($nosniff -eq "nosniff") -Details "X-Content-Type-Options='$nosniff'"))
$results.Add((New-Result -Finding "Headers" -Test "Permissions-Policy present" -Passed (-not [string]::IsNullOrWhiteSpace($permissions)) -Details "Permissions-Policy='$permissions'"))

Write-Section "Summary"
$results | Format-Table -AutoSize

if ($DryRun) {
  Write-Host "`nDry run completed. No live requests were executed." -ForegroundColor Cyan
  exit 0
}

$failed = $results | Where-Object { -not $_.Passed }
if ($failed.Count -gt 0) {
  Write-Host "`nSecurity smoke test completed with failures." -ForegroundColor Yellow
  exit 2
}

Write-Host "`nSecurity smoke test passed." -ForegroundColor Green
exit 0
