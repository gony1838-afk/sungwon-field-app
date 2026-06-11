$ErrorActionPreference = "Stop"

$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $AppDir "sungwon-field-app.pid"

if (!(Test-Path $PidFile)) {
  Write-Host "PID 파일이 없습니다. 서버가 실행 중이 아닐 수 있습니다."
  exit 0
}

$PidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
if ($PidValue -and (Get-Process -Id $PidValue -ErrorAction SilentlyContinue)) {
  Stop-Process -Id $PidValue
  Write-Host "서버를 중지했습니다. PID=$PidValue"
} else {
  Write-Host "실행 중인 서버 프로세스를 찾지 못했습니다."
}

Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
