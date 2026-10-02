@echo off
setlocal
cd /d "%~dp0"

set "EXT=%CD%\extension"
echo.
echo Shotdown browser extension
echo ==========================
echo Extension folder:
echo %EXT%
echo.

start "" explorer.exe "%EXT%"

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"

if exist "%EDGE%" (
  echo Opening Edge extensions page...
  start "" "%EDGE%" "edge://extensions/"
  goto :instructions
)

if exist "%CHROME%" (
  echo Opening Chrome extensions page...
  start "" "%CHROME%" "chrome://extensions/"
  goto :instructions
)

echo Could not locate Edge or Chrome automatically.
echo Open chrome://extensions/ or edge://extensions/ manually.

:instructions
echo.
echo FIRST RUN ONLY:
echo   1. Enable Developer mode.
echo   2. Click "Load unpacked".
echo   3. Select the extension folder opened by this script.
echo   4. Pin Shotdown to the browser toolbar.
echo.
echo AFTER INSTALL:
echo   Open any normal website in your existing browser session,
echo   then click Shotdown or press Alt+Shift+S.
echo.
pause
