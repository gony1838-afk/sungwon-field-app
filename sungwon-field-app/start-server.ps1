$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $AppDir "sungwon-field-app.pid"
$Port = if ($env:PORT) { $env:PORT } else { "3000" }

function Find-Node {
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  $codexNode = Get-ChildItem -Path "$env:LOCALAPPDATA\OpenAI\Codex\runtimes" -Recurse -Filter node.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1 -ExpandProperty FullName
  if ($codexNode) { return $codexNode }

  throw "Node.js를 찾을 수 없습니다. Node.js LTS 설치 후 다시 실행하세요."
}

if (Test-Path $PidFile) {
  $existingPid = Get-Content $PidFile -ErrorAction SilentlyContinue
  if ($existingPid -and (Get-Process -Id $existingPid -ErrorAction SilentlyContinue)) {
    Write-Host "이미 실행 중입니다. PID=$existingPid"
    Write-Host "작업자: http://localhost:$Port/"
    Write-Host "관리자: http://localhost:$Port/admin.html"
    exit 0
  }
}

$Node = Find-Node
Push-Location $AppDir
try {
  $cmd = "start `"SungWon Field App`" /min `"$Node`" server.js"
  cmd.exe /c $cmd
  Start-Sleep -Seconds 1
  $process = Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -like "*server.js*" -and $_.CommandLine -like "*node*" } |
    Sort-Object CreationDate -Descending |
    Select-Object -First 1
  if ($process) {
    $process.ProcessId | Set-Content $PidFile
    $PidText = $process.ProcessId
  } else {
    $PidText = "unknown"
  }
} finally {
  Pop-Location
}

Write-Host "성원 현장 기록 앱 서버 시작"
Write-Host "PID=$PidText"
Write-Host "작업자: http://localhost:$Port/"
Write-Host "관리자: http://localhost:$Port/admin.html"
