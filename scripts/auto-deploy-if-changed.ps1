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
    Write-Output "No code changes to deploy. Current SHA: $latestSha"
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

  & (Join-Path $ProjectRoot "scripts\publish-github-pages.ps1") -ProjectRoot $ProjectRoot
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub Pages publish failed with code $LASTEXITCODE"
  }

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
