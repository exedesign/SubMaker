@echo off
echo Starting SubMaker Frontend...
cd /d "%~dp0\electron"
npm run electron:dev
