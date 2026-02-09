#!/bin/bash

# GitHub Repository Upload Script for SubMaker
echo "🚀 SubMaker GitHub Upload Script"

# 1. Git repository başlat
echo "📁 Initializing Git repository..."
git init

# 2. Remote origin ekle (REPO_URL'yi değiştir)
echo "🔗 Adding remote origin..."
echo "⚠️  GitHub'dan aldığın URL'yi yapıştır:"
echo "git remote add origin https://github.com/KULLANICI_ADI/SubMaker.git"

# 3. Dosyaları stage'e ekle
echo "📦 Adding files..."
git add .

# 4. İlk commit
echo "💾 Creating first commit..."
git commit -m "🎉 Initial commit: SubMaker AI Subtitle Generator

Features:
🎤 Karaoke animations with fallback system  
🌍 Dual language support with translation
🔤 Arabic RTL support
🚀 4K GPU-accelerated rendering
🎨 Custom backgrounds and styling
💻 Electron desktop app"

# 5. Ana branch'i main olarak ayarla
echo "🌳 Setting main branch..."
git branch -M main

# 6. GitHub'a push
echo "☁️  Pushing to GitHub..."
echo "⚠️  Bu komutu çalıştır:"
echo "git push -u origin main"

echo "✅ Repository hazır! GitHub'da kontrol et."