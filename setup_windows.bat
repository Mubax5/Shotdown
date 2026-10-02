@echo off
setlocal
cd /d "%~dp0"

where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher ^(py^) was not found.
  echo Install Python 3.10+ from https://www.python.org/downloads/
  pause
  exit /b 1
)

if not exist .venv (
  py -m venv .venv
)

call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
pip install -e .
python -m playwright install chromium

if errorlevel 1 (
  echo.
  echo Setup failed. Read the error above.
  pause
  exit /b 1
)

echo.
echo Setup complete. Run run_windows.bat
pause
