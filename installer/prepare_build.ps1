# ============================================================================
# SubMaker - Installer Build Preparation Script (Modelsiz / Lightweight)
# ============================================================================
# Bu script Inno Setup için gerekli staging klasörünü hazırlar.
# Modeller DAHİL EDİLMEZ — kurulum sonrası indirilebilir.
#
# Adımlar:
#   1. Electron uygulamasını derler (win-unpacked)
#   2. Python Embedded indirir ve tüm paketleri kurar
#   3. FFmpeg indirir
#   4. Presetleri ve araçları kopyalar (modeller hariç)
#
# Kullanım:
#   PowerShell -ExecutionPolicy Bypass -File prepare_build.ps1
#
# Gereksinimler:
#   - Node.js 18+ ve npm
#   - Python 3.13.x (pip ile)
#   - İnternet bağlantısı (ilk çalıştırmada)
#   - ~15 GB boş disk alanı
# ============================================================================

param(
    [switch]$SkipElectronBuild,
    [switch]$SkipPythonSetup,
    [switch]$SkipFFmpeg,
    [switch]$SkipModels,
    [string]$PythonVersion = "3.13.7"
)

$ErrorActionPreference = "Stop"
$env:GIT_TERMINAL_PROMPT = "0"  # pip git clone icin interaktif prompt engelle
$ProgressPreference = "SilentlyContinue"  # Invoke-WebRequest progress bar yavaşlatır

# --- Yollar ---
$ProjectRoot   = Split-Path -Parent $PSScriptRoot  # SubMaker kök klasörü
$InstallerDir  = $PSScriptRoot
$StagingDir    = Join-Path $InstallerDir "staging"
$DownloadsDir  = Join-Path $InstallerDir "downloads"
$ElectronDir   = Join-Path $ProjectRoot "electron"
$ResourcesDir  = Join-Path $ProjectRoot "resources"
$BackendDir    = Join-Path $ProjectRoot "backend"

# Python Embedded URL
$PythonMajorMinor = ($PythonVersion -split '\.')[0..1] -join ''  # "313"
$PythonEmbedZip   = "python-$PythonVersion-embed-amd64.zip"
$PythonEmbedUrl   = "https://www.python.org/ftp/python/$PythonVersion/$PythonEmbedZip"
$GetPipUrl        = "https://bootstrap.pypa.io/get-pip.py"

# FFmpeg URL (gyan.dev static build)
$FFmpegVersion  = "7.1"
$FFmpegZip      = "ffmpeg-$FFmpegVersion-essentials_build.zip"
$FFmpegUrl      = "https://www.gyan.dev/ffmpeg/builds/packages/$FFmpegZip"

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SubMaker Installer Build Preparation"     -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project Root : $ProjectRoot"
Write-Host "Staging Dir  : $StagingDir"
Write-Host "Python       : $PythonVersion (embedded)"
Write-Host ""

# --- Yardımcı fonksiyonlar ---
function Write-Step($step, $msg) {
    Write-Host "[$step] $msg" -ForegroundColor Yellow
}

function Ensure-Dir($path) {
    if (-not (Test-Path $path)) {
        New-Item -ItemType Directory -Path $path -Force | Out-Null
    }
}

# --- Downloads klasörünü oluştur ---
Ensure-Dir $DownloadsDir
Ensure-Dir $StagingDir

# ============================================================================
# ADIM 1: Electron Uygulamasını Derle
# ============================================================================
if (-not $SkipElectronBuild) {
    Write-Step "1/5" "Electron uygulamasi derleniyor..."

    Push-Location $ElectronDir
    try {
        # Node modüllerini kontrol et
        if (-not (Test-Path "node_modules")) {
            Write-Host "  npm install calisiyor..." -ForegroundColor Gray
            npm install
            if ($LASTEXITCODE -ne 0) { throw "npm install basarisiz" }
        }

        # Electron Builder ile derle (win-unpacked)
        Write-Host "  electron-builder --win --dir calisiyor..." -ForegroundColor Gray
        npx electron-builder --win --dir --config.directories.output="../installer/electron-build"
        if ($LASTEXITCODE -ne 0) { throw "electron-builder basarisiz" }
    }
    finally {
        Pop-Location
    }

    # win-unpacked'ı staging'e kopyala (modeller HARIC)
    $WinUnpacked = Join-Path $InstallerDir "electron-build\win-unpacked"
    if (-not (Test-Path $WinUnpacked)) {
        throw "electron-builder ciktisi bulunamadi: $WinUnpacked"
    }

    Write-Host "  Electron dosyalari staging'e kopyalaniyor..." -ForegroundColor Gray
    $AppStaging = Join-Path $StagingDir "app"
    if (Test-Path $AppStaging) { Remove-Item $AppStaging -Recurse -Force }

    # Robocopy ile kopyala (modeller hariç — /XD ile dışla)
    $ModelsInBuild = Join-Path $WinUnpacked "resources\resources\models"
    robocopy $WinUnpacked $AppStaging /E /NFL /NDL /NJH /NJS /NC /NS /NP `
        /XD $ModelsInBuild | Out-Null

    Write-Host "  Electron uygulama dosyalari kopyalandi." -ForegroundColor Green
}
else {
    Write-Host "[1/5] Electron build ATLANDI (-SkipElectronBuild)" -ForegroundColor DarkGray

    # Önceki build varsa onu kullan
    $ExistingBuild = Join-Path $ProjectRoot "electron\release\build\win-unpacked"
    $AppStaging    = Join-Path $StagingDir "app"
    if ((Test-Path $ExistingBuild) -and -not (Test-Path $AppStaging)) {
        Write-Host "  Mevcut build kullaniliyor: $ExistingBuild" -ForegroundColor Gray
        $ModelsInBuild = Join-Path $ExistingBuild "resources\resources\models"
        robocopy $ExistingBuild $AppStaging /E /NFL /NDL /NJH /NJS /NC /NS /NP `
            /XD $ModelsInBuild | Out-Null
    }
}

# ============================================================================
# ADIM 2: Python Embedded Kurulumu
# ============================================================================
if (-not $SkipPythonSetup) {
    Write-Step "2/5" "Python $PythonVersion Embedded kuruluyor..."

    $PythonStaging = Join-Path $StagingDir "python"
    if (Test-Path $PythonStaging) { Remove-Item $PythonStaging -Recurse -Force }
    Ensure-Dir $PythonStaging

    # 2a. Python Embedded indir
    $PythonZipPath = Join-Path $DownloadsDir $PythonEmbedZip
    if (-not (Test-Path $PythonZipPath)) {
        Write-Host "  Python Embedded indiriliyor: $PythonEmbedUrl" -ForegroundColor Gray
        Invoke-WebRequest -Uri $PythonEmbedUrl -OutFile $PythonZipPath
    }
    else {
        Write-Host "  Python Embedded zaten indirilmis." -ForegroundColor DarkGray
    }

    # 2b. Zip'i aç
    Write-Host "  Python arsivi aciliyor..." -ForegroundColor Gray
    Expand-Archive -Path $PythonZipPath -DestinationPath $PythonStaging -Force

    # 2c. _pth dosyasını düzenle (import site aktif et)
    # Bu, pip ve site-packages'ın çalışması için ZORUNLUDUR
    $PthFile = Get-ChildItem $PythonStaging -Filter "python*._pth" | Select-Object -First 1
    if ($PthFile) {
        $PthContent = Get-Content $PthFile.FullName -Raw
        # "import site" satırının başındaki # işaretini kaldır
        $PthContent = $PthContent -replace '#\s*import site', 'import site'
        Set-Content -Path $PthFile.FullName -Value $PthContent -NoNewline
        Write-Host "  _pth dosyasi duzenlendi (import site aktif)." -ForegroundColor Gray
    }

    # 2d. get-pip.py indir ve çalıştır
    $GetPipPath = Join-Path $DownloadsDir "get-pip.py"
    if (-not (Test-Path $GetPipPath)) {
        Write-Host "  get-pip.py indiriliyor..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $GetPipUrl -OutFile $GetPipPath
    }

    $PythonExe = Join-Path $PythonStaging "python.exe"

    Write-Host "  pip kuruluyor..." -ForegroundColor Gray
    $prevEA = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & $PythonExe $GetPipPath --no-warn-script-location 2>&1 | Out-Null
    $ErrorActionPreference = $prevEA
    if ($LASTEXITCODE -ne 0) { throw "get-pip.py basarisiz" }

    # 2e. PyTorch + CUDA 12.4 kur (ayrı index URL gerekli)
    Write-Host "  PyTorch + CUDA 12.4 kuruluyor (bu uzun surebilir)..." -ForegroundColor Gray
    $prevEA = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & $PythonExe -m pip install --no-warn-script-location `
        torch torchvision torchaudio `
        --index-url https://download.pytorch.org/whl/cu124 2>&1 | ForEach-Object {
            if ($_ -match "Successfully installed") { Write-Host "  $_" -ForegroundColor Green }
        }
    $pipExit = $LASTEXITCODE; $ErrorActionPreference = $prevEA
    if ($pipExit -ne 0) { throw "PyTorch kurulumu basarisiz" }

    # 2f. onnxruntime-gpu kur (onnxruntime ile çakışmaması için önce kur)
    Write-Host "  onnxruntime-gpu kuruluyor..." -ForegroundColor Gray
    $prevEA = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & $PythonExe -m pip install --no-warn-script-location onnxruntime-gpu 2>&1 | Out-Null
    $pipExit = $LASTEXITCODE; $ErrorActionPreference = $prevEA
    if ($pipExit -ne 0) {
        Write-Host "  UYARI: onnxruntime-gpu kurulamadi, devam ediliyor..." -ForegroundColor DarkYellow
    }

    # 2f-bis. autoawq — Windows'ta ozel kurulum gerektirir (--no-build-isolation --no-deps)
    # Standart pip install ile build hatalari verir; requirements.txt'ten ONCE kurulmali
    Write-Host "  autoawq kuruluyor (Windows ozel kurulum)..." -ForegroundColor Gray
    $prevEA = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & $PythonExe -m pip install --no-warn-script-location `
        autoawq --no-build-isolation --no-deps 2>&1 | ForEach-Object {
            $line = $_.ToString()
            if ($line -match "Successfully installed") { Write-Host "  $line" -ForegroundColor Green }
            elseif ($line -match "ERROR") { Write-Host "  $line" -ForegroundColor Red }
        }
    $pipExit = $LASTEXITCODE; $ErrorActionPreference = $prevEA
    if ($pipExit -ne 0) {
        Write-Host "  UYARI: autoawq kurulamadi (AWQ cevirisi/Qwen modeli calismayabilir)." -ForegroundColor DarkYellow
    }

    # 2g. requirements.txt'ten geri kalan paketleri kur
    Write-Host "  Backend paketleri kuruluyor (git clone adimi uzun surebilir)..." -ForegroundColor Gray
    $ReqFile = Join-Path $BackendDir "requirements.txt"
    $prevEA = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
    & $PythonExe -m pip install --no-warn-script-location -r $ReqFile 2>&1 | ForEach-Object {
        $line = $_.ToString()
        if ($line -match "Successfully installed") { Write-Host "  $line" -ForegroundColor Green }
        elseif ($line -match "ERROR") { Write-Host "  $line" -ForegroundColor Red }
        elseif ($line -match "Running command git clone") { Write-Host "  $line" -ForegroundColor Gray }
    }
    $pipExit = $LASTEXITCODE; $ErrorActionPreference = $prevEA
    if ($pipExit -ne 0) {
        Write-Host "  UYARI: Bazi paketler kurulamadi, kontrol edin." -ForegroundColor DarkYellow
    }

    # 2h. Gereksiz dosyaları temizle (boyutu küçült)
    Write-Host "  Gereksiz dosyalar temizleniyor..." -ForegroundColor Gray
    $SitePackages = Join-Path $PythonStaging "Lib\site-packages"
    # __pycache__ temizle
    Get-ChildItem $PythonStaging -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    # Test klasörlerini temizle
    Get-ChildItem $SitePackages -Recurse -Directory -Filter "tests" -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Get-ChildItem $SitePackages -Recurse -Directory -Filter "test" -ErrorAction SilentlyContinue |
        Where-Object { $_.FullName -notmatch "unittest" } |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    # .dist-info klasörlerindeki büyük dosyalar
    Get-ChildItem $SitePackages -Recurse -Filter "RECORD" -ErrorAction SilentlyContinue |
        Where-Object { $_.DirectoryName -match "\.dist-info" } |
        ForEach-Object { Set-Content $_.FullName -Value "" }

    # 2i. _pth ve python313.zip dosyalarini dogrula (embedded Python icin ZORUNLU)
    # pip veya temizlik adimlari bu dosyalari silebilir — restore et
    $PthFile = Join-Path $PythonStaging "python${PythonMajorMinor}._pth"
    $StdlibZip = Join-Path $PythonStaging "python${PythonMajorMinor}.zip"
    if (-not (Test-Path $StdlibZip)) {
        Write-Host "  UYARI: python${PythonMajorMinor}.zip kayip — arsivden geri yukleniyor..." -ForegroundColor DarkYellow
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        $zip = [System.IO.Compression.ZipFile]::OpenRead($PythonZipPath)
        $entry = $zip.GetEntry("python${PythonMajorMinor}.zip")
        if ($entry) {
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $StdlibZip, $true)
            Write-Host "  python${PythonMajorMinor}.zip geri yuklendi." -ForegroundColor Green
        }
        $zip.Dispose()
    }
    # _pth dosyasini her zaman yeniden yaz (pip bozabilir)
    $PthContent = "python${PythonMajorMinor}.zip`nLib`nLib\site-packages`nDLLs`n.`nimport site`n"
    Set-Content -Path $PthFile -Value $PthContent -NoNewline -Encoding ASCII
    Write-Host "  _pth dosyasi dogrulandi." -ForegroundColor Gray

    $PythonSize = [math]::Round(((Get-ChildItem $PythonStaging -Recurse -File |
        Measure-Object Length -Sum).Sum / 1GB), 2)
    Write-Host "  Python ortami hazir: $PythonSize GB" -ForegroundColor Green
}
else {
    Write-Host "[2/5] Python setup ATLANDI (-SkipPythonSetup)" -ForegroundColor DarkGray
}

# ============================================================================
# ADIM 3: FFmpeg İndir
# ============================================================================
if (-not $SkipFFmpeg) {
    Write-Step "3/5" "FFmpeg indiriliyor..."

    $FFmpegStaging = Join-Path $StagingDir "ffmpeg"
    Ensure-Dir $FFmpegStaging

    $FFmpegZipPath = Join-Path $DownloadsDir $FFmpegZip
    if (-not (Test-Path $FFmpegZipPath)) {
        Write-Host "  FFmpeg indiriliyor: $FFmpegUrl" -ForegroundColor Gray
        try {
            Invoke-WebRequest -Uri $FFmpegUrl -OutFile $FFmpegZipPath
        }
        catch {
            # Alternatif URL
            $AltUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
            Write-Host "  Ana kaynak basarisiz, alternatif deneniyor..." -ForegroundColor DarkYellow
            Invoke-WebRequest -Uri $AltUrl -OutFile $FFmpegZipPath
        }
    }

    # Zip'i geçici klasöre aç ve ffmpeg.exe/ffprobe.exe'yi kopyala
    $FFmpegTemp = Join-Path $DownloadsDir "ffmpeg-temp"
    if (Test-Path $FFmpegTemp) { Remove-Item $FFmpegTemp -Recurse -Force }
    Write-Host "  FFmpeg arsivi aciliyor..." -ForegroundColor Gray
    Expand-Archive -Path $FFmpegZipPath -DestinationPath $FFmpegTemp -Force

    # ffmpeg.exe ve ffprobe.exe'yi bul (iç içe klasörlerde olabilir)
    $FFmpegExe = Get-ChildItem $FFmpegTemp -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
    $FFprobeExe = Get-ChildItem $FFmpegTemp -Recurse -Filter "ffprobe.exe" | Select-Object -First 1

    if ($FFmpegExe) {
        Copy-Item $FFmpegExe.FullName (Join-Path $FFmpegStaging "ffmpeg.exe") -Force
        Write-Host "  ffmpeg.exe kopyalandi." -ForegroundColor Green
    }
    else { Write-Host "  UYARI: ffmpeg.exe bulunamadi!" -ForegroundColor Red }

    if ($FFprobeExe) {
        Copy-Item $FFprobeExe.FullName (Join-Path $FFmpegStaging "ffprobe.exe") -Force
        Write-Host "  ffprobe.exe kopyalandi." -ForegroundColor Green
    }

    # Geçici klasörü temizle
    Remove-Item $FFmpegTemp -Recurse -Force -ErrorAction SilentlyContinue
}
else {
    Write-Host "[3/5] FFmpeg ATLANDI (-SkipFFmpeg)" -ForegroundColor DarkGray
}

# ============================================================================
# ADIM 4: Presetleri ve Araçları Kopyala (Modeller HAR İÇ)
# ============================================================================
if (-not $SkipModels) {
    Write-Step "4/5" "Presetler ve araclar kopyalaniyor (modeller HARIC)..."

    $PresetsSource = Join-Path $ResourcesDir "presets"
    $PresetsStaging = Join-Path $StagingDir "presets"
    $ToolsStaging = Join-Path $StagingDir "tools"

    Ensure-Dir $PresetsStaging
    Ensure-Dir $ToolsStaging

    # Presetleri kopyala
    Write-Host "  Presetler kopyalaniyor..." -ForegroundColor Gray
    if (-not (Test-Path (Join-Path $PresetsStaging "*.json"))) {
        robocopy $PresetsSource $PresetsStaging /E /MT:4 /NFL /NDL /NJH /NJS /NC /NS /NP | Out-Null
    }

    # Model indirme aracını kopyala
    Write-Host "  Model indirme araci kopyalaniyor..." -ForegroundColor Gray
    $DownloadScript = Join-Path $InstallerDir "download_models.py"
    if (Test-Path $DownloadScript) {
        Copy-Item $DownloadScript (Join-Path $ToolsStaging "download_models.py") -Force
        Write-Host "  download_models.py kopyalandi." -ForegroundColor Green
    }
    else {
        Write-Host "  UYARI: download_models.py bulunamadi: $DownloadScript" -ForegroundColor Red
    }

    Write-Host "  Presetler ve araclar hazir (modeller dahil EDILMEDI)." -ForegroundColor Green
    Write-Host "  NOT: Modeller kurulum sonrasi kullanici tarafindan indirilecek." -ForegroundColor Cyan
}
else {
    Write-Host "[4/5] Presetler/Araclar ATLANDI (-SkipModels)" -ForegroundColor DarkGray
}

# ============================================================================
# ADIM 5: Özet ve Doğrulama
# ============================================================================
Write-Step "5/5" "Staging dogrulaniyor..."

$Components = @(
    @{ Name = "app";     Path = Join-Path $StagingDir "app" }
    @{ Name = "python";  Path = Join-Path $StagingDir "python" }
    @{ Name = "ffmpeg";  Path = Join-Path $StagingDir "ffmpeg" }
    @{ Name = "presets"; Path = Join-Path $StagingDir "presets" }
    @{ Name = "tools";   Path = Join-Path $StagingDir "tools" }
)

$allOk = $true
$totalSize = 0

foreach ($comp in $Components) {
    if (Test-Path $comp.Path) {
        $size = (Get-ChildItem $comp.Path -Recurse -File -ErrorAction SilentlyContinue |
            Measure-Object Length -Sum).Sum
        $sizeGB = [math]::Round($size / 1GB, 2)
        $totalSize += $size
        Write-Host "  [OK] $($comp.Name): $sizeGB GB" -ForegroundColor Green
    }
    else {
        Write-Host "  [EKSIK] $($comp.Name): $($comp.Path)" -ForegroundColor Red
        $allOk = $false
    }
}

$totalGB = [math]::Round($totalSize / 1GB, 2)
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Staging Toplam: $totalGB GB (modeller haric)" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan

if ($allOk) {
    Write-Host ""
    Write-Host "  Staging hazir! Simdi Inno Setup ile derleyin:" -ForegroundColor Green
    Write-Host "    iscc installer\SubMaker.iss" -ForegroundColor White
    Write-Host ""
    Write-Host "  NOT: AI modelleri kuruluma dahil EDILMEMISTIR." -ForegroundColor Cyan
    Write-Host "  Kullanicilar kurulum sonrasi modelleri indirebilir." -ForegroundColor Cyan
    Write-Host "  Beklenen installer boyutu: ~$([math]::Round($totalGB * 0.60, 1)) - $([math]::Round($totalGB * 0.75, 1)) GB" -ForegroundColor DarkGray
}
else {
    Write-Host ""
    Write-Host "  UYARI: Bazi bilesenler eksik! Yukaridaki hatalari kontrol edin." -ForegroundColor Red
}
