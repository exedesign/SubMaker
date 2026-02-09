@echo off
chcp 65001 >nul
title SubMaker Web Launcher

echo.
echo  ==========================================
echo       SubMaker Web Interface Launcher
echo  ==========================================
echo.

:: Kill existing processes
echo  Stopping any existing services...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Start Backend with logging
echo  [1/3] Starting Backend Server (Port 5000)...
cd /d "D:\AI\SubMaker"
start "SubMaker-Backend" cmd /k "echo Starting Backend... && python -m backend.main"

timeout /t 6 /nobreak >nul

:: Start Frontend
echo  [2/3] Starting Frontend Server (Port 5173)...
cd /d "D:\AI\SubMaker\electron" 
start "SubMaker-Frontend" cmd /k "echo Starting Frontend... && npm run dev"

timeout /t 10 /nobreak >nul

:: Open in browser
echo  [3/3] Opening Web Interface in Browser...
start "SubMaker-Web" http://localhost:5173

echo.
echo  ✅ SubMaker Web Interface Ready!
echo  =================================
echo.
echo   🌐 Web Interface: http://localhost:5173
echo   📊 Backend Console: SubMaker-Backend window
echo   🔧 Frontend Console: SubMaker-Frontend window
echo.
echo   📝 Console windows show detailed logs for debugging.
echo.
echo  Press any key to stop all services and exit...
pause

:: Cleanup on exit
echo.
echo  Stopping all services...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
echo  All services stopped. Goodbye!
timeout /t 2 /nobreak >nul