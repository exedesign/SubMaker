@echo off
title SubMaker - Electron Dev
cd /d "%~dp0"

:: Kill any existing Python processes on port 5000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    echo Killing existing process on port 5000 (PID: %%a)
    taskkill /F /PID %%a >nul 2>&1
)

:: Start Python backend in background
echo Starting Python backend...
start /B python backend\main.py

:: Wait for backend to be ready
echo Waiting for backend...
:wait_loop
timeout /t 2 /nobreak >nul
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:5000/api/health' -TimeoutSec 2 -UseBasicParsing; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel% neq 0 goto wait_loop
echo Backend is ready!

:: Start Electron dev mode
cd /d "%~dp0electron"
echo Starting Electron dev mode...
npm run electron:dev
pause
