@echo off
chcp 65001 >nul
title SubMaker Web Launcher

echo.
echo  SubMaker - Starting Web Interface...
echo  ====================================
echo.

:: Kill existing processes
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
timeout /t 2 /nobreak >nul

:: Start Backend with console logging
echo  Starting Backend Server on Port 5000...
cd /d "D:\AI\SubMaker"
start "SubMaker-Backend" cmd /k "python -m backend.main"

timeout /t 5 /nobreak >nul

:: Start Web Frontend
echo  Starting Web Frontend on Port 5173...
cd /d "D:\AI\SubMaker\electron"
start "SubMaker-Frontend" cmd /k "npm run dev"

timeout /t 8 /nobreak >nul

:: Open in default browser
echo  Opening in browser...
start "SubMaker-Web" http://localhost:5173

echo.
echo  Web Interface Ready!
echo  ====================
echo  - Backend Console: SubMaker-Backend window
echo  - Frontend Console: SubMaker-Frontend window  
echo  - Web Interface: http://localhost:5173
echo.
echo  Press any key to close all services...
pause

:: Cleanup
echo Stopping services...
taskkill /F /IM python.exe >nul 2>&1
taskkill /F /IM node.exe >nul 2>&1
