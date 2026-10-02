@echo off
setlocal
cd /d "%~dp0"

set "EXT=%CD%\extension"
set "CHOICE=%~1"

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

if /I "%CHOICE%"=="edge" goto :edge
if /I "%CHOICE%"=="chrome" goto :chrome

tasklist /FI "IMAGENAME eq chrome.exe" 2>NUL | find /I "chrome.exe" >NUL
if not errorlevel 1 if exist "%CHROME%" goto :chrome

tasklist /FI "IMAGENAME eq msedge.exe" 2>NUL | find /I "msedge.exe" >NUL
if not errorlevel 1 if exist "%EDGE%" goto :edge

if exist "%EDGE%" goto :edge
if exist "%CHROME%" goto :chrome
goto :manual

:edge
echo Opening Edge extensions page...
start "" "%EDGE%" "edge://extensions/"
goto :instructions

:chrome
echo Opening Chrome extensions page...
start "" "%CHROME%" "chrome://extensions/"
goto :instructions

:manual
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
echo   Use your normal browser session.
echo   Click Shotdown or press Alt+Shift+S.
echo   Keep the target tab active while capture is running.
echo.
echo Optional:
echo   run_extension.bat chrome
echo   run_extension.bat edge
echo.
pause
