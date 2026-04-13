@echo off
echo 🚀 SubMaker GitHub Upload Script

REM 1. Git repository başlat
echo 📁 Initializing Git repository...
git init

REM 2. Dosyaları stage'e ekle  
echo 📦 Adding files...
git add .

REM 3. İlk commit
echo 💾 Creating first commit...
git commit -m "🎉 Initial commit: SubMaker AI Subtitle Generator - Features: 🎤 Karaoke animations with fallback system, 🌍 Dual language support, 🔤 Arabic RTL support, 🚀 4K GPU rendering, 🎨 Custom styling, 💻 Electron desktop app"

REM 4. Ana branch'i main olarak ayarla
echo 🌳 Setting main branch...
git branch -M main

echo.
echo ⚠️  SONRAKI ADIMLAR:
echo.
echo 1. GitHub'da yeni repository oluştur: https://github.com/new
echo    📝 Name: SubMaker
echo    📝 Description: 🎤 AI Subtitle Generator with Karaoke Effects
echo.
echo 2. GitHub'dan aldığın URL ile remote ekle:
echo    git remote add origin https://github.com/KULLANICI_ADI/SubMaker.git
echo.
echo 3. GitHub'a yükle:
echo    git push -u origin main
echo.
echo ✅ Script tamamlandı!
pause