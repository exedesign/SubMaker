; ============================================================================
; SubMaker NSIS Installer  v1.1.0
; ============================================================================
; Pages  : Welcome -> Directory -> AI Models (opt.) -> InstFiles -> Finish
; Models : NOT INCLUDED -- use Model Manager in app or download_models.py
; Build  : cd installer  &  makensis SubMaker.nsi
; ============================================================================

!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"

; ─── Metadata ─────────────────────────────────────────────────────────────────
!define APP_NAME      "SubMaker"
!define APP_VERSION   "1.2.0"
!define MODELS_STAGING "staging\models"
!define APP_PUBLISHER "exedesign"
!define APP_URL       "https://github.com/exedesign/SubMaker"
!define APP_EXE           "SubMaker.exe"
!define STAGING           "staging"
!define PYTHON_ARCHIVE    "SubMaker_Python_Runtime.7z"
!define UNINST_KEY    "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"
!define ENV_KEY       "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"

; ─── Build Mode ───────────────────────────────────────────────────────────────
; Default (full bundle): Python (+ torch CUDA) extracted from SubMaker_Python_Runtime.7z.
;   Vocal Separator models bundled inline (~805 MB).
;   Requires installer EXE + SubMaker_Python_Runtime.7z in same folder.
;   No internet needed after install.
;   Build: makensis SubMaker.nsi
;
; MINIMAL_PYTHON (legacy): Python bundled inline — do NOT use with torch (exceeds 2GB limit).
;   Build: makensis /DMINIMAL_PYTHON SubMaker.nsi

; ─── Installer Settings ───────────────────────────────────────────────────────
Name             "${APP_NAME} ${APP_VERSION}"
OutFile          "output\SubMaker_Setup_${APP_VERSION}.exe"
InstallDir       "$PROGRAMFILES64\${APP_NAME}"
InstallDirRegKey HKLM "${UNINST_KEY}" "InstallLocation"
RequestExecutionLevel admin
Unicode          true

; Python is installed from a separate archive (SubMaker_Python_Runtime.7z).
; The app+ffmpeg+tools payload is <500MB → well within 32-bit NSIS 2GB limit.
SetCompressor lzma
SetCompressorDictSize 32

; ─── Version Info ─────────────────────────────────────────────────────────────
VIProductVersion "${APP_VERSION}.0"
VIAddVersionKey  "ProductName"     "${APP_NAME}"
VIAddVersionKey  "ProductVersion"  "${APP_VERSION}"
VIAddVersionKey  "CompanyName"     "${APP_PUBLISHER}"
VIAddVersionKey  "FileDescription" "${APP_NAME} Setup"
VIAddVersionKey  "FileVersion"     "${APP_VERSION}"
VIAddVersionKey  "LegalCopyright"  "(c) ${APP_PUBLISHER}"

; ─── MUI2 Settings ────────────────────────────────────────────────────────────
!define MUI_ICON   "..\electron\public\icon.ico"
!define MUI_UNICON "..\electron\public\icon.ico"
!define MUI_ABORTWARNING
BrandingText "${APP_NAME} v${APP_VERSION} - ${APP_PUBLISHER}"

!define MUI_WELCOMEPAGE_TITLE "${APP_NAME} v${APP_VERSION}"
!define MUI_WELCOMEPAGE_TEXT  "This wizard will install ${APP_NAME} on your computer.$\r$\n$\r$\nPlace SubMaker_Python_Runtime.7z and SubMaker_Models.7z.001+ in the same folder as this installer before proceeding.$\r$\n$\r$\nWhisper Turbo and Vocal Separator models are bundled and installed automatically. Additional models (Whisper variants, Qwen, FLUX) can be downloaded from within the app.$\r$\n$\r$\nClick Next to continue."

!define MUI_FINISHPAGE_RUN          "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT     "Launch ${APP_NAME}"
!define MUI_FINISHPAGE_TITLE        "Installation Complete"
!define MUI_FINISHPAGE_TEXT         "${APP_NAME} has been successfully installed.$\r$\n$\r$\nWhisper Turbo and Vocal Separator are ready to use.$\r$\n$\r$\nAdditional models (Whisper variants, Qwen translation, FLUX cover art) can be downloaded from the app's System Health panel."
!define MUI_FINISHPAGE_LINK         "GitHub: ${APP_NAME}"
!define MUI_FINISHPAGE_LINK_LOCATION "${APP_URL}"

; ─── Pages ────────────────────────────────────────────────────────────────────
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
Page custom ModelDirPageCreate ModelDirPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; ─── Languages ────────────────────────────────────────────────────────────────
!insertmacro MUI_LANGUAGE "English"
!insertmacro MUI_LANGUAGE "Turkish"

; ─── Variables ────────────────────────────────────────────────────────────────
Var ModelDirText
Var ModelDirBrowseBtn
Var ModelSourcePath

; ─── Custom Page: Existing AI Models (Optional) ───────────────────────────────
Function ModelDirPageCreate
  !insertmacro MUI_HEADER_TEXT "AI Models (Optional)" "Point to existing models or skip to download later."

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 44u "If you already have SubMaker AI models (turbo, audio-separator, etc.) select the folder that contains those sub-folders. Leave empty to skip — models can be downloaded from within the app after installation."
  Pop $0

  ${NSD_CreateLabel}        0 54u 24% 12u "Model folder:"
  Pop $0

  ${NSD_CreateText}         26% 53u 58% 14u ""
  Pop $ModelDirText

  ${NSD_CreateBrowseButton} 86% 52u 14% 16u "Browse..."
  Pop $ModelDirBrowseBtn
  ${NSD_OnClick} $ModelDirBrowseBtn OnModelDirBrowse

  nsDialogs::Show
FunctionEnd

Function OnModelDirBrowse
  nsDialogs::SelectFolderDialog "Select model folder" ""
  Pop $0
  ${If} $0 != error
    ${NSD_SetText} $ModelDirText $0
  ${EndIf}
FunctionEnd

Function ModelDirPageLeave
  ${NSD_GetText} $ModelDirText $ModelSourcePath

  ${If} $ModelSourcePath == ""
    Return
  ${EndIf}

  ${IfNot} ${FileExists} "$ModelSourcePath\*"
    MessageBox MB_OK|MB_ICONEXCLAMATION "Folder not found:$\r$\n$ModelSourcePath"
    Abort
  ${EndIf}

  StrCpy $0 0
  ${If} ${FileExists} "$ModelSourcePath\turbo\*"
    IntOp $0 $0 + 1
  ${EndIf}
  ${If} ${FileExists} "$ModelSourcePath\audio-separator\*"
    IntOp $0 $0 + 1
  ${EndIf}
  ${If} ${FileExists} "$ModelSourcePath\qwen2.5-3b-awq\*"
    IntOp $0 $0 + 1
  ${EndIf}

  ${If} $0 == 0
    MessageBox MB_YESNO|MB_ICONQUESTION "No recognized model sub-folders found.$\r$\nContinue anyway?" IDYES skip_warn
    Abort
    skip_warn:
    StrCpy $ModelSourcePath ""
  ${EndIf}
FunctionEnd

; ─── PATH Helpers ─────────────────────────────────────────────────────────────
Function StrContains
  Exch $R1
  Exch
  Exch $R0
  Push $R2
  Push $R3
  Push $R4
  StrLen $R3 $R1
  StrCpy $R4 0
  sc_loop:
    StrCpy $R2 $R0 $R3 $R4
    ${If} $R2 == $R1
      StrCpy $R0 $R1
      Goto sc_done
    ${EndIf}
    ${If} $R2 == ""
      StrCpy $R0 ""
      Goto sc_done
    ${EndIf}
    IntOp $R4 $R4 + 1
    Goto sc_loop
  sc_done:
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

Function AddToPath
  ReadRegStr $1 HKLM "${ENV_KEY}" "Path"
  ${If} $1 == ""
    WriteRegExpandStr HKLM "${ENV_KEY}" "Path" "$0"
    Goto atp_done
  ${EndIf}
  Push $1
  Push $0
  Call StrContains
  Pop $2
  ${If} $2 != ""
    Goto atp_done
  ${EndIf}
  WriteRegExpandStr HKLM "${ENV_KEY}" "Path" "$1;$0"
  atp_done:
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
FunctionEnd

Function un.StrRem
  Exch $R1
  Exch
  Exch $R0
  Push $R2
  Push $R3
  Push $R4
  Push $R5
  StrLen $R3 $R1
  StrCpy $R4 ""
  StrCpy $R5 0
  rem_loop:
    StrCpy $R2 $R0 $R3 $R5
    ${If} $R2 == ""
      StrCpy $R0 "$R4$R0"
      Goto rem_done
    ${EndIf}
    ${If} $R2 == $R1
      IntOp $R5 $R5 + $R3
      StrCpy $R2 $R0 "" $R5
      StrCpy $R0 "$R4$R2"
      Goto rem_done
    ${EndIf}
    StrCpy $R2 $R0 1 $R5
    StrCpy $R4 "$R4$R2"
    IntOp $R5 $R5 + 1
    Goto rem_loop
  rem_done:
  Pop $R5
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

Function un.RemoveFromPath
  ReadRegStr $1 HKLM "${ENV_KEY}" "Path"
  ${If} $1 == ""
    Return
  ${EndIf}
  Push $1
  Push ";$0"
  Call un.StrRem
  Pop $1
  Push $1
  Push "$0;"
  Call un.StrRem
  Pop $1
  Push $1
  Push "$0"
  Call un.StrRem
  Pop $1
  WriteRegExpandStr HKLM "${ENV_KEY}" "Path" "$1"
  SendMessage ${HWND_BROADCAST} ${WM_WININICHANGE} 0 "STR:Environment" /TIMEOUT=5000
FunctionEnd

; ─── Visual C++ Redistributable ──────────────────────────────────────────────
; Python native packages (torch, ctranslate2, numpy, onnxruntime) require
; MSVCP140.dll / VCRUNTIME140.dll from VC++ 2015-2022 x64.
; Without it they fail with "DLL load failed" which looks like ModuleNotFoundError.
; vc_redist.x64.exe is embedded in the installer — no separate file needed.
Section "-VCRedist" SecVCRedist
  SectionIn RO

  ; Check if VC++ 2015-2022 x64 is already present
  ReadRegDWORD $0 HKLM "SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64" "Installed"
  ${If} $0 == 1
    DetailPrint "Visual C++ 2015-2022 Redistributable: already installed."
    Goto vcredist_done
  ${EndIf}

  ; Extract embedded vc_redist.x64.exe to TEMP and install silently
  DetailPrint "Installing Visual C++ 2015-2022 Redistributable..."
  SetOutPath "$TEMP"
  SetCompress off
  File "output\vc_redist.x64.exe"
  SetCompress auto
  ExecWait '"$TEMP\vc_redist.x64.exe" /install /quiet /norestart' $0
  Delete "$TEMP\vc_redist.x64.exe"
  ${If} $0 == 0
    DetailPrint "Visual C++ Redistributable installed successfully."
  ${ElseIf} $0 == 3010
    DetailPrint "Visual C++ Redistributable installed (restart may be required)."
  ${Else}
    MessageBox MB_OK|MB_ICONEXCLAMATION \
      "Visual C++ Redistributable installation returned code $0.$\r$\n$\r$\nIf SubMaker fails to start, install vc_redist.x64.exe manually:$\r$\nhttps://aka.ms/vs/17/release/vc_redist.x64.exe"
  ${EndIf}

  vcredist_done:
SectionEnd

; ─── Install Section ──────────────────────────────────────────────────────────
Section "SubMaker" SecMain
  SectionIn RO

  DetailPrint "Installing application files..."
  SetOutPath "$INSTDIR"
  File /r "${STAGING}\app\*"

  DetailPrint "Installing FFmpeg..."
  SetOutPath "$INSTDIR\ffmpeg"
  File "${STAGING}\ffmpeg\ffmpeg.exe"
  File "${STAGING}\ffmpeg\ffprobe.exe"
  SetOutPath "$INSTDIR"

  DetailPrint "Installing tools..."
  CreateDirectory "$INSTDIR\tools"
  SetOutPath "$INSTDIR\tools"
  File "${STAGING}\tools\download_models.py"
!ifndef MINIMAL_PYTHON
  File "${STAGING}\tools\7z.exe"
  File "${STAGING}\tools\7z.dll"
!endif
  SetOutPath "$INSTDIR"

!ifdef MINIMAL_PYTHON
  ; ── Minimal Python: bundled directly in installer ───────────────────────
  DetailPrint "Installing Python runtime (minimal)..."
  CreateDirectory "$INSTDIR\python"
  SetOutPath "$INSTDIR\python"
  File /r "${STAGING}\python\*"
  SetOutPath "$INSTDIR"
  DetailPrint "Python runtime installed. ML packages will be installed on first launch."
!else
  ; ── Full Python: extracted from separate 7z archive ─────────────────────
  ${If} ${FileExists} "$EXEDIR\${PYTHON_ARCHIVE}"
    DetailPrint "Extracting Python runtime — this may take several minutes..."
    CreateDirectory "$INSTDIR\python"
    ExecWait '"$INSTDIR\tools\7z.exe" x "$EXEDIR\${PYTHON_ARCHIVE}" -o"$INSTDIR\python" -y' $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "Python runtime extraction failed (exit $0).$\r$\n$\r$\nSubMaker requires Python to function.$\r$\nPlease re-run this installer."
    ${Else}
      DetailPrint "Python runtime installed successfully."
    ${EndIf}
  ${Else}
    MessageBox MB_OK|MB_ICONEXCLAMATION "Python runtime archive not found!$\r$\n$\r$\nExpected: $EXEDIR\${PYTHON_ARCHIVE}$\r$\n$\r$\nPlace ${PYTHON_ARCHIVE} in the same folder as this installer, then re-run."
  ${EndIf}
!endif

  ; ── AI Models — extracted from SubMaker_Models.7z.001 sidecar archive ────────
  ; All models (Whisper, Vocal Separator, Qwen, FLUX) are in the split 7z.
  ; config.py resolves them via resolve_model_dir() — bundled dir is checked
  ; after user dir, so user downloads always take precedence.
  ${If} ${FileExists} "$EXEDIR\SubMaker_Models.7z.001"
    DetailPrint "Installing AI models — this may take several minutes..."
    CreateDirectory "$INSTDIR\resources\resources\models"
    ExecWait '"$INSTDIR\tools\7z.exe" x "$EXEDIR\SubMaker_Models.7z.001" -o"$INSTDIR\resources\resources\models" -y' $0
    ${If} $0 != 0
      MessageBox MB_OK|MB_ICONEXCLAMATION "AI model extraction failed (exit $0).$\r$\n$\r$\nModels can be downloaded from within the app."
    ${Else}
      DetailPrint "AI models installed successfully."
    ${EndIf}
  ${Else}
    DetailPrint "SubMaker_Models.7z.001 not found — models can be downloaded from within the app."
  ${EndIf}

  ; ── Optional: user-supplied models ───────────────────────────────────────────
  ${If} $ModelSourcePath != ""
    DetailPrint "Copying AI models from: $ModelSourcePath"
    CreateDirectory "$INSTDIR\resources\resources\models"
    CopyFiles /SILENT "$ModelSourcePath\*" "$INSTDIR\resources\resources\models"
  ${EndIf}

  DetailPrint "Updating system PATH..."
  StrCpy $0 "$INSTDIR\ffmpeg"
  Call AddToPath
  StrCpy $0 "$INSTDIR\python"
  Call AddToPath

  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  ; Use icon.ico if present, otherwise fall back to the exe's embedded icon
  ${If} ${FileExists} "$INSTDIR\icon.ico"
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icon.ico" 0
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk"                "$INSTDIR\${APP_EXE}" "" "$INSTDIR\icon.ico" 0
  ${Else}
    CreateShortCut "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
    CreateShortCut "$DESKTOP\${APP_NAME}.lnk"                "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  ${EndIf}
  CreateShortCut "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk" "$INSTDIR\uninstall.exe" "" "$INSTDIR\uninstall.exe" 0

  WriteUninstaller "$INSTDIR\uninstall.exe"

  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0

  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayVersion"  "${APP_VERSION}"
  WriteRegStr   HKLM "${UNINST_KEY}" "Publisher"       "${APP_PUBLISHER}"
  WriteRegStr   HKLM "${UNINST_KEY}" "URLInfoAbout"    "${APP_URL}"
  WriteRegStr   HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr   HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr   HKLM "${UNINST_KEY}" "DisplayIcon"     "$INSTDIR\icon.ico"
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify"        1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair"        1
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize"   $0

SectionEnd

; ─── Uninstall Section ────────────────────────────────────────────────────────
Section "Uninstall"

  StrCpy $0 "$INSTDIR\ffmpeg"
  Call un.RemoveFromPath
  StrCpy $0 "$INSTDIR\python"
  Call un.RemoveFromPath

  RMDir /r "$INSTDIR\python"
  RMDir /r "$INSTDIR\ffmpeg"
  RMDir /r "$INSTDIR\tools"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\swiftshader"
  RMDir /r "$INSTDIR\assets"

  ; ── Bundled models (inside install dir) ──────────────────────────────────
  ${If} ${FileExists} "$INSTDIR\resources\resources\models\*"
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Keep bundled AI models?$\r$\n$\r$\n$INSTDIR\resources\resources\models$\r$\n$\r$\nModels can be several GB. Keeping them lets you reinstall without re-downloading.$\r$\n$\r$\nYes = Keep models    No = Delete models" \
      IDYES keep_bundled_models
    RMDir /r "$INSTDIR\resources\resources\models"
    keep_bundled_models:
  ${EndIf}
  ; Remove rest of resources (presets, fonts, etc.) but leave models dir if kept
  RMDir /r "$INSTDIR\resources\presets"
  RMDir /r "$INSTDIR\resources\fonts"
  RMDir    "$INSTDIR\resources"

  ; ── User data models (%APPDATA%\SubMaker\models) ─────────────────────────
  ReadEnvStr $0 "APPDATA"
  StrCpy $1 "$0\SubMaker\models"
  ${If} ${FileExists} "$1\*"
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Keep user AI models?$\r$\n$\r$\n$1$\r$\n$\r$\nThese are models downloaded via the Model Manager. Keeping them lets you reinstall without re-downloading.$\r$\n$\r$\nYes = Keep models    No = Delete models" \
      IDYES keep_user_models
    RMDir /r "$1"
    keep_user_models:
  ${EndIf}

  Delete "$INSTDIR\${APP_EXE}"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\*.ico"
  Delete "$INSTDIR\*.png"
  Delete "$INSTDIR\*.svg"
  Delete "$INSTDIR\*.bmp"
  Delete "$INSTDIR\*.html"
  Delete "$INSTDIR\*.txt"
  Delete "$INSTDIR\LICENSE*"
  Delete "$INSTDIR\LICENSES*"
  Delete "$INSTDIR\uninstall.exe"
  RMDir  "$INSTDIR"

  ; ── App settings / logs ──────────────────────────────────────────────────
  ; User data lives at %APPDATA%\SubMaker (set by Electron as SUBMAKER_USER_DATA)
  ${If} ${FileExists} "$APPDATA\${APP_NAME}\*"
    MessageBox MB_YESNO|MB_ICONQUESTION \
      "Delete application settings and logs?$\r$\n$\r$\n$APPDATA\${APP_NAME}" \
      IDNO skip_appdata
    RMDir /r "$APPDATA\${APP_NAME}"
    skip_appdata:
  ${EndIf}

  Delete "$DESKTOP\${APP_NAME}.lnk"
  RMDir /r "$SMPROGRAMS\${APP_NAME}"
  DeleteRegKey HKLM "${UNINST_KEY}"

SectionEnd