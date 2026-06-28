param(
  [string]$ProjectRoot = "D:\RuleQuant\rulequant-terminal",
  [string]$BuildRoot = "D:\RuleQuant\rulequant-terminal-static-build",
  [string]$PagesRoot = "D:\RuleQuant\rulequant-terminal-pages",
  [string]$PagesRepo = "https://github.com/Xrenyan/rulequant-terminal-pages.git",
  [string]$PublicUrl = "https://xrenyan.github.io/rulequant-terminal-pages/dashboard/"
)

$ErrorActionPreference = "Stop"

$nodePath = "C:\Users\32129\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$binPath = "C:\Users\32129\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin"
$env:PATH = "$nodePath;$binPath;$env:PATH"
$env:GITHUB_PAGES_BASE_PATH = "/rulequant-terminal-pages"

$project = (Resolve-Path -LiteralPath $ProjectRoot).Path
$buildRootFull = $BuildRoot
if (-not (Test-Path -LiteralPath $PagesRoot)) {
  git clone $PagesRepo $PagesRoot
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub Pages clone failed with code $LASTEXITCODE"
  }
}

$pages = (Resolve-Path -LiteralPath $PagesRoot).Path
if (-not $pages.StartsWith("D:\RuleQuant\rulequant-terminal-pages")) {
  throw "Unexpected GitHub Pages target: $pages"
}

Push-Location $project
try {
  pnpm refresh:static-data
  if ($LASTEXITCODE -ne 0) {
    throw "static data refresh failed with code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

if (Test-Path -LiteralPath $buildRootFull) {
  $resolvedBuildRoot = (Resolve-Path -LiteralPath $buildRootFull).Path
  if (-not $resolvedBuildRoot.StartsWith("D:\RuleQuant\rulequant-terminal-static-build")) {
    throw "Unexpected static build target: $resolvedBuildRoot"
  }
  $linkedNodeModules = Join-Path $resolvedBuildRoot "node_modules"
  if (Test-Path -LiteralPath $linkedNodeModules) {
    cmd /c "rmdir `"$linkedNodeModules`"" | Out-Null
  }
  Remove-Item -LiteralPath $resolvedBuildRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $buildRootFull -Force | Out-Null
$robocopyArgs = @(
  $project,
  $buildRootFull,
  "/MIR",
  "/XD", ".git", ".next", "out", "output", "node_modules",
  "/XF", "*.log", "*.pid"
)
robocopy @robocopyArgs | Out-Null
if ($LASTEXITCODE -gt 7) {
  throw "static build workspace copy failed with code $LASTEXITCODE"
}
cmd /c "mklink /J `"$buildRootFull\node_modules`" `"$project\node_modules`"" | Out-Null

Push-Location $buildRootFull
try {
  node scripts/build-static-pages.mjs
  if ($LASTEXITCODE -ne 0) {
    throw "static pages build failed with code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$out = (Resolve-Path -LiteralPath (Join-Path $buildRootFull "out")).Path

Push-Location $pages
try {
  git pull --rebase origin main
  if ($LASTEXITCODE -ne 0) {
    throw "GitHub Pages pull failed with code $LASTEXITCODE"
  }

  git config user.name "RuleQuant"
  git config user.email "rulequant-local@example.com"

  Get-ChildItem -LiteralPath $pages -Force |
    Where-Object { $_.Name -ne ".git" } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

  Get-ChildItem -LiteralPath $out -Force |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $pages -Recurse -Force }

  Set-Content -LiteralPath (Join-Path $pages ".nojekyll") -Value "" -Encoding ASCII

  git add -A
  $changes = git status --short
  if ($changes) {
    git commit -m "Deploy latest RuleQuant static site"
    if ($LASTEXITCODE -ne 0) {
      throw "GitHub Pages commit failed with code $LASTEXITCODE"
    }

    git push origin main
    if ($LASTEXITCODE -ne 0) {
      throw "GitHub Pages push failed with code $LASTEXITCODE"
    }
  } else {
    Write-Output "GitHub Pages already up to date."
  }
} finally {
  Pop-Location
}

for ($i = 1; $i -le 12; $i++) {
  $checkUrl = "${PublicUrl}?v=$(Get-Date -Format yyyyMMddHHmmss)"
  $response = Invoke-WebRequest -UseBasicParsing -Uri $checkUrl -TimeoutSec 30 -Headers @{
    "Cache-Control" = "no-cache"
    "User-Agent" = "RuleQuant-github-pages-check"
  }

  if ($response.StatusCode -eq 200 -and $response.Content -match "/rulequant-terminal-pages/_next/") {
    Write-Output "RuleQuant GitHub Pages deployed and verified: $PublicUrl"
    return
  }

  Start-Sleep -Seconds 10
}

throw "GitHub Pages check failed for $PublicUrl"
