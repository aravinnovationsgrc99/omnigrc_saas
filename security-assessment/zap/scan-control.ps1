$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
New-Item -ItemType Directory -Force .\security-assessment\zap | Out-Null
$zapDir = (Resolve-Path .\security-assessment\zap).Path
Write-Host "ZapDir: $zapDir"
Write-Host "Stamp: $stamp"

docker run --rm `
  -v "${zapDir}:/zap/wrk/:rw" `
  ghcr.io/zaproxy/zaproxy:stable `
  zap-baseline.py `
  -t https://control.omnigrc.co `
  -m 3 `
  -I `
  -r "zap-control-$stamp.html" `
  -J "zap-control-$stamp.json"

$exitCode = $LASTEXITCODE
Write-Host "ZAP Exit Code: $exitCode"
Write-Host "SCAN_STAMP=$stamp"
Write-Host "SCAN_EXIT_CODE=$exitCode"
