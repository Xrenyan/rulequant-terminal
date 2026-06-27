param(
  [string]$ProjectRoot = "D:\RuleQuant\rulequant-terminal",
  [string]$DeployRoot = "D:\RuleQuant\deploy-rulequant-terminal",
  [string]$PublicUrl = "https://rulequant-terminal.vercel.app/dashboard"
)

$ErrorActionPreference = "Stop"

$nodePath = "C:\Users\32129\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$binPath = "C:\Users\32129\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin"
$env:PATH = "$nodePath;$binPath;$env:PATH"

$source = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not (Test-Path -LiteralPath $DeployRoot)) {
  New-Item -ItemType Directory -Path $DeployRoot | Out-Null
}
$target = (Resolve-Path -LiteralPath $DeployRoot).Path
if ($target -ne $DeployRoot) {
  throw "Unexpected deploy target: $target"
}

robocopy $source $target /MIR /XD .git .next node_modules output release /XF *.log *.tsbuildinfo | Out-Null
if ($LASTEXITCODE -ge 8) {
  throw "Robocopy failed with code $LASTEXITCODE"
}

$vercelDir = Join-Path $target ".vercel"
$artifacts = @(
  (Join-Path $target "node_modules"),
  (Join-Path $target ".next"),
  (Join-Path $vercelDir "output")
)
foreach ($artifact in $artifacts) {
  if (Test-Path -LiteralPath $artifact) {
    Remove-Item -LiteralPath $artifact -Recurse -Force
  }
}

Push-Location $target
try {
  pnpm dlx vercel@latest deploy --prod --yes --force --archive=tgz --logs --no-color
  if ($LASTEXITCODE -ne 0) {
    throw "Vercel deploy failed with code $LASTEXITCODE"
  }
} finally {
  Pop-Location
}

$response = Invoke-WebRequest -UseBasicParsing -Uri $PublicUrl -TimeoutSec 30 -Headers @{
  "Cache-Control" = "no-cache"
  "User-Agent" = "RuleQuant-auto-deploy-check"
}
if ($response.StatusCode -ne 200 -or $response.Content -notmatch "RuleQuant") {
  throw "Production check failed for $PublicUrl"
}

Write-Output "RuleQuant production deployed and verified: $PublicUrl"
