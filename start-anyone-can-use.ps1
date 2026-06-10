$ErrorActionPreference = "Stop"

$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $ProjectDir

$ToolDir = Join-Path $ProjectDir ".tools"
$Cloudflared = Join-Path $ToolDir "cloudflared.exe"
$ServerOut = Join-Path $ProjectDir "server.out.log"
$ServerErr = Join-Path $ProjectDir "server.err.log"
$TunnelOut = Join-Path $ProjectDir "cloudflared.out.log"
$TunnelErr = Join-Path $ProjectDir "cloudflared.err.log"

function Write-Step($Message) {
  Write-Host ""
  Write-Host "== $Message" -ForegroundColor Cyan
}

function Wait-ForPublicUrl {
  param([int] $Seconds = 45)

  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $text = ""
    if (Test-Path -LiteralPath $TunnelOut) {
      $text += Get-Content -LiteralPath $TunnelOut -Raw -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $TunnelErr) {
      $text += Get-Content -LiteralPath $TunnelErr -Raw -ErrorAction SilentlyContinue
    }

    $match = [regex]::Match($text, "https://[a-zA-Z0-9-]+\.trycloudflare\.com")
    if ($match.Success) {
      return $match.Value
    }
  }

  return $null
}

function Wait-ForPublicHealth {
  param(
    [string] $PublicUrl,
    [int] $Seconds = 90
  )

  $healthUrl = "$($PublicUrl.TrimEnd('/'))/api/health"
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $health = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 5
      if ($health.ok) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  return $false
}

function Test-StudyPlannerHealth {
  param([int] $Port)

  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
    return [bool] $health.ok
  } catch {
    return $false
  }
}

function Find-FreePort {
  for ($port = 4173; $port -le 4199; $port++) {
    if (Test-StudyPlannerHealth -Port $port) {
      return @{
        Port = $port
        ExistingHealthy = $true
      }
    }

    $connection = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $connection) {
      return @{
        Port = $port
        ExistingHealthy = $false
      }
    }
  }

  throw "No available local port found between 4173 and 4199."
}

Clear-Host
Write-Host "Study Planner - public website launcher" -ForegroundColor Green
Write-Host ""
Write-Host "This starts the real shared website. Wait for the public HTTPS URL."
Write-Host "When it appears, it will be opened and copied to your clipboard."
Write-Host "Keep this window open while other people are using the website."

Write-Step "Checking Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host "ERROR: Node.js was not found." -ForegroundColor Red
  Write-Host "Install Node.js, then run start-anyone-can-use.cmd again."
  Read-Host "Press Enter to exit"
  exit 1
}
Write-Host "Node found: $($node.Source)"

if (-not (Test-Path -LiteralPath $ToolDir)) {
  New-Item -ItemType Directory -Path $ToolDir | Out-Null
}

if (-not (Test-Path -LiteralPath $Cloudflared)) {
  Write-Step "Downloading Cloudflare cloudflared"
  Write-Host "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
  try {
    Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $Cloudflared
  } catch {
    Write-Host "ERROR: Download failed." -ForegroundColor Red
    Write-Host $_.Exception.Message
    Write-Host ""
    Write-Host "Check your network and run this again. For a fixed public URL, read PUBLIC_DEPLOYMENT.md."
    Read-Host "Press Enter to exit"
    exit 1
  }
}

Write-Step "Starting local server"
$portChoice = Find-FreePort
$LocalPort = [int] $portChoice.Port
if ($portChoice.ExistingHealthy) {
  Write-Host "Local server is already running on port $LocalPort. Reusing it."
} else {
  Write-Host "Starting local server on port $LocalPort."
  $escapedProjectDir = $ProjectDir.Replace("'", "''")
  $serverCommand = "`$env:PORT='$LocalPort'; Set-Location -LiteralPath '$escapedProjectDir'; node server.mjs"
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $serverCommand) -WorkingDirectory $ProjectDir -RedirectStandardOutput $ServerOut -RedirectStandardError $ServerErr -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/api/health" -TimeoutSec 5
  if (-not $health.ok) {
    throw "Health check did not return ok=true."
  }
} catch {
  Write-Host "ERROR: Local server did not start correctly." -ForegroundColor Red
  Write-Host "Tried local URL: http://127.0.0.1:$LocalPort/api/health"
  if (Test-Path -LiteralPath $ServerErr) {
    Get-Content -LiteralPath $ServerErr -Tail 40
  }
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Step "Creating public HTTPS URL"
Remove-Item -LiteralPath $TunnelOut, $TunnelErr -Force -ErrorAction SilentlyContinue
$tunnel = Start-Process -FilePath $Cloudflared -ArgumentList @("tunnel", "--url", "http://127.0.0.1:$LocalPort") -WorkingDirectory $ProjectDir -RedirectStandardOutput $TunnelOut -RedirectStandardError $TunnelErr -WindowStyle Hidden -PassThru

$publicUrl = Wait-ForPublicUrl -Seconds 45
if (-not $publicUrl) {
  Write-Host "ERROR: Could not find the trycloudflare.com URL." -ForegroundColor Red
  Write-Host "Cloudflared output:"
  if (Test-Path -LiteralPath $TunnelErr) {
    Get-Content -LiteralPath $TunnelErr -Tail 80
  }
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Step "Waiting for the public URL to become reachable"
$publicReady = Wait-ForPublicHealth -PublicUrl $publicUrl -Seconds 90
if (-not $publicReady) {
  Write-Host "ERROR: This temporary Cloudflare URL was created but is not reachable yet." -ForegroundColor Red
  Write-Host "Close this window, run start-anyone-can-use.cmd again, and use the new PUBLIC WEBSITE URL."
  Write-Host "Cloudflare quick tunnel URLs are temporary and sometimes fail before DNS is published."
  Write-Host ""
  Write-Host "Local fallback, only for this computer: http://127.0.0.1:$LocalPort"
  Read-Host "Press Enter to exit"
  exit 1
}

Write-Host ""
Write-Host "PUBLIC WEBSITE URL:" -ForegroundColor Green
Write-Host $publicUrl -ForegroundColor Yellow
Write-Host ""
Write-Host "This URL has been copied to your clipboard and opened in the browser."
Write-Host "Send it to anyone who should use the study planner."
Write-Host ""

try {
  Set-Clipboard -Value $publicUrl
} catch {
  Write-Host "Clipboard copy failed, but the URL above is valid."
}

Start-Process $publicUrl

Write-Host "Keep this window open. Closing it will stop the public tunnel."
Write-Host "Local fallback, only for this computer: http://127.0.0.1:$LocalPort"
Write-Host ""
Read-Host "Press Enter only when you want to stop watching this launcher"
