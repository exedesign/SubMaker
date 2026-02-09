@echo off
echo ============================================
echo   SubMaker Setup Script
echo ============================================
echo.

cd /d "%~dp0"

echo [1/4] Creating Python virtual environment...
cd backend
python -m venv venv
if errorlevel 1 (
    echo ERROR: Failed to create virtual environment
    echo Make sure Python 3.9+ is installed
    pause
    exit /b 1
)

echo.
echo [2/4] Activating virtual environment...
call venv\Scripts\activate.bat

echo.
echo [3/4] Installing Python dependencies...
pip install --upgrade pip
pip install -r requirements.txt
if errorlevel 1 (
    echo WARNING: Some packages failed to install
    echo You may need to install them manually
)

echo.
echo [4/4] Installing Node.js dependencies...
cd ..\electron
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    echo Make sure Node.js 18+ is installed
    pause
    exit /b 1
)

echo.
echo ============================================
echo   Setup Complete!
echo ============================================
echo.
echo To start the application:
echo   1. Run: start-backend.bat
echo   2. Run: start-frontend.bat
echo.
echo Or run both with: npm run electron:dev (in electron folder)
echo.
pause
