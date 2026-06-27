param(
  [string]$ProjectRoot = "D:\RuleQuant\rulequant-terminal",
  [string]$StateRoot = "D:\RuleQuant\.automation",
  [switch]$InitializeOnly
)

$ErrorActionPreference = "Stop"

$nodePath = "C:\Users\32129\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$binPath = "C:\Users\32129\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin"
$env:PATH = "$nodePath;$binPath;$env:PATH"

if (-not (Test-Path -LiteralPath $StateRoot)) {
  New-Item -ItemType Directory -Path $StateRoot | Out-Null
}

$markerFile = Join-Path $StateRoot "last-deployed-sha.txt"
$cloudStateUrl = "https://rulequant-terminal.vercel.app/api/cloud/state"
$pagesStateUrl = "https://xrenyan.github.io/rulequant-terminal-pages/static-cloud-state.json"

function Get-RuleQuantStateSummary {
  param([string]$Url)

  $cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $state = Invoke-RestMethod -Uri "${Url}?t=$cacheBust" -TimeoutSec 45 -Headers @{
    "Cache-Control" = "no-cache"
    "User-Agent" = "RuleQuant-auto-deploy-check"
  }

  [PSCustomObject]@{
    LatestIssue = [string]$state.meta.latestIssue
    UpdatedAt = [string]$state.meta.updatedAt
    DrawCount = @($state.draws).Count
  }
}

function Get-PagesDataStatus {
  try {
    $cloud = Get-RuleQuantStateSummary -Url $cloudStateUrl
    $pages = Get-RuleQuantStateSummary -Url $pagesStateUrl
    $needsRefresh = ($cloud.LatestIssue -ne $pages.LatestIssue) -or ($cloud.UpdatedAt -ne $pages.UpdatedAt) -or ($cloud.DrawCount -ne $pages.DrawCount)

    [PSCustomObject]@{
      CheckFailed = $false
      NeedsRefresh = $needsRefresh
      CloudLatestIssue = $cloud.LatestIssue
      PagesLatestIssue = $pages.LatestIssue
      CloudUpdatedAt = $cloud.UpdatedAt
      PagesUpdatedAt = $pages.UpdatedAt
      CloudDrawCount = $cloud.DrawCount
      PagesDrawCount = $pages.DrawCount
      Error = ""
    }
  } catch {
    [PSCustomObject]@{
      CheckFailed = $true
      NeedsRefresh = $false
      CloudLatestIssue = ""
      PagesLatestIssue = ""
      CloudUpdatedAt = ""
      PagesUpdatedAt = ""
      CloudDrawCount = 0
      PagesDrawCount = 0
      Error = $_.Exception.Message
    }
  }
}

function Publish-GithubPagesShare {
  param(
    [string]$ProjectRoot,
    [string]$Reason
  )

  Write-Output $Reason
  & (Join-Path $ProjectRoot "scripts\publish-github-pages.ps1") -ProjectRoot $ProjectRoot
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub Pages publish failed with code $LASTEXITCODE"
  }
}

Push-Location $ProjectRoot
try {
  git fetch origin main | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "git fetch failed with code $LASTEXITCODE"
  }

  $latestSha = (git rev-parse origin/main).Trim()
  if (-not $latestSha) {
    throw "Unable to resolve origin/main"
  }

  $lastSha = ""
  if (Test-Path -LiteralPath $markerFile) {
    $lastSha = (Get-Content -LiteralPath $markerFile -Raw).Trim()
  }

  if ($InitializeOnly) {
    Set-Content -LiteralPath $markerFile -Value $latestSha -Encoding ASCII
    Write-Output "Initialized deployed marker at $latestSha"
    return
  }

  if ($latestSha -eq $lastSha) {
    $dataStatus = Get-PagesDataStatus
    if ($dataStatus.CheckFailed) {
      Write-Output "No code changes to deploy. Data freshness check failed: $($dataStatus.Error)"
      return
    }

    if ($dataStatus.NeedsRefresh) {
      Publish-GithubPagesShare -ProjectRoot $ProjectRoot -Reason "No code changes, but cloud data changed. Cloud issue: $($dataStatus.CloudLatestIssue), Pages issue: $($dataStatus.PagesLatestIssue)."
      Write-Output "GitHub Pages data refreshed. Latest issue: $($dataStatus.CloudLatestIssue), draws: $($dataStatus.CloudDrawCount)"
      return
    }

    Write-Output "No code changes to deploy. GitHub Pages data is current. Latest issue: $($dataStatus.PagesLatestIssue), draws: $($dataStatus.PagesDrawCount). Current SHA: $latestSha"
    return
  }

  $changedFiles = @()
  if ($lastSha) {
    $changedFiles = git diff --name-only $lastSha $latestSha
  } else {
    $changedFiles = git show --name-only --format="" $latestSha
  }

  $deployAffecting = $changedFiles | Where-Object {
    $_ -match "^(src/|public/|tests/|scripts/|package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|next\.config\.ts|vercel\.json|\.vercelignore|postcss\.config\.mjs|tsconfig\.json|vitest\.config\.ts|eslint\.config\.mjs|\.github/workflows/)"
  }

  if (-not $deployAffecting.Count) {
    $dataStatus = Get-PagesDataStatus
    if (-not $dataStatus.CheckFailed -and $dataStatus.NeedsRefresh) {
      Publish-GithubPagesShare -ProjectRoot $ProjectRoot -Reason "Only non-deploy files changed, but cloud data changed. Refreshing GitHub Pages data."
    }

    Set-Content -LiteralPath $markerFile -Value $latestSha -Encoding ASCII
    Write-Output "Only non-deploy files changed. Marker updated to $latestSha"
    return
  }

  git pull --rebase origin main
  if ($LASTEXITCODE -ne 0) {
    throw "git pull failed with code $LASTEXITCODE"
  }

  pnpm typecheck
  if ($LASTEXITCODE -ne 0) {
    throw "typecheck failed with code $LASTEXITCODE"
  }

  pnpm test -- --runInBand
  if ($LASTEXITCODE -ne 0) {
    throw "tests failed with code $LASTEXITCODE"
  }

  pnpm build
  if ($LASTEXITCODE -ne 0) {
    throw "build failed with code $LASTEXITCODE"
  }

  Publish-GithubPagesShare -ProjectRoot $ProjectRoot -Reason "Deploy-affecting code changed. Publishing GitHub Pages share URL first."

  $vercelStatus = "Vercel publish not attempted"
  try {
    & (Join-Path $ProjectRoot "scripts\publish-production.ps1") -ProjectRoot $ProjectRoot
    if ($LASTEXITCODE -ne 0) {
      throw "publish failed with code $LASTEXITCODE"
    }
    $vercelStatus = "Vercel production deployed"
  } catch {
    $vercelStatus = "Vercel production deploy failed: $($_.Exception.Message)"
    Write-Warning $vercelStatus
  }

  Set-Content -LiteralPath $markerFile -Value $latestSha -Encoding ASCII
  Write-Output "Auto deployed RuleQuant GitHub Pages at $latestSha. $vercelStatus"
} finally {
  Pop-Location
}
