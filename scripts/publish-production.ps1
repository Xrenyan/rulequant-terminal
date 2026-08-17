param(
  [string]$ProjectRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$DeployRoot = "",
  [string]$PublicUrl = "https://rulequant-terminal.vercel.app/dashboard"
)

$ErrorActionPreference = "Stop"

$source = (Resolve-Path -LiteralPath $ProjectRoot).Path
if (-not $DeployRoot) {
  $DeployRoot = Join-Path (Split-Path -Parent $source) "deploy-rulequant-terminal"
}
$DeployRoot = [System.IO.Path]::GetFullPath($DeployRoot)
if (-not (Test-Path -LiteralPath $DeployRoot)) {
  New-Item -ItemType Directory -Path $DeployRoot | Out-Null
}
$target = (Resolve-Path -LiteralPath $DeployRoot).Path
if ($target -ne $DeployRoot) {
  throw "Unexpected deploy target: $target"
}

robocopy $source $target /MIR /XD .git .next node_modules out output release /XF *.log *.tsbuildinfo | Out-Null
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
  $deployed = $false
  for ($attempt = 1; $attempt -le 3; $attempt++) {
    pnpm dlx vercel@59.1.3 deploy --prod --yes --force --archive=tgz --logs --no-color
    if ($LASTEXITCODE -eq 0) {
      $deployed = $true
      break
    }

    if ($attempt -lt 3) {
      Write-Warning "Vercel deploy attempt $attempt failed with code $LASTEXITCODE. Retrying..."
      Start-Sleep -Seconds 15
    }
  }

  if (-not $deployed) {
    throw "Vercel deploy failed after 3 attempts"
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
