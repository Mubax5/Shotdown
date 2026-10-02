@echo off
setlocal
cd /d "%~dp0"

where gh >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI ^(gh^) is not installed.
  echo Install it from https://cli.github.com/ and run this file again.
  pause
  exit /b 1
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo GitHub CLI is not authenticated.
  gh auth login
  if errorlevel 1 exit /b 1
)

echo Updating GitHub repository metadata...
gh repo edit Mubax5/Shotdown ^
  --description "Pick any scrollable area in Chrome or Edge, crop it, and capture long dynamic content cleanly as size-capped PDF evidence." ^
  --add-topic screenshot ^
  --add-topic scroll-capture ^
  --add-topic chrome-extension ^
  --add-topic edge-extension ^
  --add-topic whatsapp ^
  --add-topic pdf ^
  --add-topic evidence ^
  --add-topic long-screenshot

if errorlevel 1 (
  echo.
  echo Metadata update failed.
  pause
  exit /b 1
)

echo.
echo Repository description and topics updated.
pause
