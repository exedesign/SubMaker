@echo off
echo Starting SubMaker Backend...
cd /d "%~dp0\backend"
call venv\Scripts\activate.bat
python main.py
pause
