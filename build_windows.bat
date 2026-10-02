@echo off
setlocal
cd /d "%~dp0"
call .venv\Scripts\activate.bat
pip install -e .[dev]
pyinstaller --noconfirm --clean --windowed --name Shotdown --paths src --collect-all playwright src\longchatpdf\__main__.py

echo.
echo Build finished in dist\Shotdown\
pause
