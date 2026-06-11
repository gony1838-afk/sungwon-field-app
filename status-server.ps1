$AppDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $AppDir "sungwon-field-app.pid"
$Port = if ($env:PORT) { $env:PORT } else { "3000" }

if (Test-Path $PidFile) {
  $PidValue = Get-Content $PidFile -ErrorAction SilentlyContinue
  $proc = if ($PidValue) { Get-Process -Id $PidValue -ErrorAction SilentlyContinue } else { $null }
  if ($proc) {
    Write-Host "실행 중: PID=$PidValue"
  } else {
    Write-Host "PID 파일은 있으나 프로세스가 없습니다."
  }
} else {
  Write-Host "PID 파일이 없습니다."
}

try {
  $res = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
  Write-Host "서버 응답: $($res.StatusCode) $($res.Content)"
} catch {
  Write-Host "서버 응답 없음: $($_.Exception.Message)"
}
