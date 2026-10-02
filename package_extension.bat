@echo off
setlocal
cd /d "%~dp0"

set "OUT=%CD%\dist"
if not exist "%OUT%" mkdir "%OUT%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root = Get-Location;" ^
  "$files = @('manifest.json','core.js','content.js','service-worker.js');" ^
  "$tmp = Join-Path $env:TEMP ('Shotdown-extension-' + [guid]::NewGuid().ToString('N'));" ^
  "$dst = Join-Path $root 'dist\Shotdown-extension-v0.4.0.zip';" ^
  "New-Item -ItemType Directory -Path $tmp | Out-Null;" ^
  "foreach ($f in $files) { Copy-Item (Join-Path $root ('extension\' + $f)) (Join-Path $tmp $f) };" ^
  "if (Test-Path $dst) { Remove-Item $dst -Force };" ^
  "Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath $dst -CompressionLevel Optimal;" ^
  "Remove-Item $tmp -Recurse -Force"

if errorlevel 1 (
  echo.
  echo Packaging failed.
  pause
  exit /b 1
)

echo.
echo Created:
echo %OUT%\Shotdown-extension-v0.4.0.zip
pause
