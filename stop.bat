@echo off
title SubMaker - Stop All Services
color 0C

echo.
echo  Stopping SubMaker Services...
echo  =============================
echo.

:: Kill SubMaker terminals by title
echo [1/3] Closing SubMaker Backend...
taskkill /F /FI "WINDOWTITLE eq SubMaker Backend*" >nul 2>&1

echo [2/3] Closing SubMaker Frontend...
taskkill /F /FI "WINDOWTITLE eq SubMaker Frontend*" >nul 2>&1

:: Also try to kill by port (more reliable)
echo [3/3] Cleaning up ports...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo.
echo  ========================================
echo  SubMaker services stopped!
echo  ========================================
echo.
echo  Press any key to close...
pause >nul
