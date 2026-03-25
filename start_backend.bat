@echo off
title SubMaker Backend Server
echo ===============================================================
echo    SUBMAKER - Backend Server Starter
echo ===============================================================
echo.

cd /d "%~dp0"

:: Kill any existing Python processes on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo Killing existing process on port 5000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

echo Starting backend server on http://127.0.0.1:5000 ...
echo.

python backend/main.py

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Server failed to start!
    echo Make sure Python is installed and dependencies are available.
    echo Try: pip install -r backend/requirements.txt
    pause
)
