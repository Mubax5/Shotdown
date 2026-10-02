@echo off
setlocal
cd /d "%~dp0"

set "OUT=%CD%\dist"
if not exist "%OUT%" mkdir "%OUT%"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$src = Join-Path (Get-Location) 'extension';" ^
  "$dst = Join-Path (Get-Location) 'dist\Shotdown-extension.zip';" ^
  "if (Test-Path $dst) { Remove-Item $dst -Force };" ^
  "Compress-Archive -Path (Join-Path $src '*') -DestinationPath $dst -CompressionLevel Optimal"

if errorlevel 1 (
  echo Packaging failed.
  pause
  exit /b 1
)

echo.
echo Created:
echo %OUT%\Shotdown-extension.zip
pause
