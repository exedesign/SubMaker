; ============================================================================
; SubMaker - Inno Setup Installer Script
; ============================================================================

#define MyAppName      "SubMaker"
#define MyAppVersion   "1.1.0"
#define MyAppPublisher "exedesign"
#define MyAppURL       "https://github.com/exedesign/SubMaker"
#define MyAppExeName   "SubMaker.exe"
#define PythonVersion  "3.13.7"
#define StagingDir     "..\installer\staging"

[Setup]
AppId={{F7A3B2C1-4D5E-6F78-9A0B-C1D2E3F4A5B6}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
OutputDir=output
OutputBaseFilename=SubMaker_Setup_{#MyAppVersion}
Compression=lzma2/ultra
SolidCompression=yes
LZMANumBlockThreads=4
LZMAAlgorithm=1
LZMAUseSeparateProcess=yes
LZMANumFastBytes=273
ArchitecturesAllowed=x64compatible
PrivilegesRequired=admin
WizardStyle=modern
WizardSizePercent=120,120
SetupIconFile=..\electron\public\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
WizardImageFile=wizard_image.bmp,wizard_image_large.bmp
WizardSmallImageFile=wizard_small.bmp,wizard_small_large.bmp
ExtraDiskSpaceRequired=536870912
DisableWelcomePage=no
DisableDirPage=no
DisableProgramGroupPage=yes
ShowLanguageDialog=auto
VersionInfoVersion=1.1.0.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Installer
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Messages]
english.BeveledLabel=SubMaker
turkish.BeveledLabel=SubMaker

[Types]
Name: "standard"; Description: "Standard Installation -- App + Python + FFmpeg + Presets (~6 GB)"
Name: "minimal";  Description: "Minimal -- App + Python + FFmpeg (~6 GB, no presets)"
Name: "custom";   Description: "Custom Installation"; Flags: iscustom

[Components]
Name: "core";    Description: "SubMaker Application (Electron)";                       Types: standard minimal custom; Flags: fixed
Name: "python";  Description: "Python {#PythonVersion} Runtime + AI Packages (~5 GB)"; Types: standard minimal custom; Flags: fixed
Name: "ffmpeg";  Description: "FFmpeg Media Processor (~150 MB)";                      Types: standard minimal custom; Flags: fixed
Name: "presets"; Description: "Visualizer Presets (1,755 presets, ~8 MB)";              Types: standard custom
Name: "tools";   Description: "Model Download Tool (download_models.py)";              Types: standard minimal custom; Flags: fixed

[Files]
Source: "{#StagingDir}\app\*"; DestDir: "{app}"; Components: core; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "resources\resources\models\*"
Source: "{#StagingDir}\python\*"; DestDir: "{app}\python"; Components: python; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StagingDir}\ffmpeg\ffmpeg.exe"; DestDir: "{app}\ffmpeg"; Components: ffmpeg; Flags: ignoreversion
Source: "{#StagingDir}\ffmpeg\ffprobe.exe"; DestDir: "{app}\ffmpeg"; Components: ffmpeg; Flags: ignoreversion
Source: "{#StagingDir}\presets\*"; DestDir: "{app}\resources\resources\presets"; Components: presets; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StagingDir}\tools\download_models.py"; DestDir: "{app}\tools"; Components: tools; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}";          Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{group}\Download AI Models";     Filename: "{app}\python\python.exe"; Parameters: """{app}\tools\download_models.py"" --info"; WorkingDir: "{app}"; IconFilename: "{app}\icon.ico"; Comment: "View and download AI models for SubMaker"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}";     Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Registry]
Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}\ffmpeg;{app}\python"; Check: NeedsAddPath(ExpandConstant('{app}\ffmpeg')) and NeedsAddPath(ExpandConstant('{app}\python'))

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\python\Lib\site-packages\__pycache__"
Type: filesandordirs; Name: "{app}\resources\resources\models"
Type: filesandordirs; Name: "{userappdata}\SubMaker"

[Code]
var
  ModelInfoPage: TOutputMsgMemoWizardPage;
  ModelDirPage: TInputDirWizardPage;
  ModelSourcePath: string;

const
  MODEL_DIRS = 'turbo,audio-separator,qwen2.5-3b-awq,small,tiny,distil-large-v3,flux-klein-4b,flux-small-decoder';

function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath)
  then begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Uppercase(Param) + ';', ';' + Uppercase(OrigPath) + ';') = 0;
end;

function CountModelsInDir(Dir: string): Integer;
var
  J: Integer;
  Token: string;
  Pos1, Len: Integer;
  ModelList: string;
begin
  Result := 0;
  ModelList := MODEL_DIRS;
  Len := Length(ModelList);
  Pos1 := 1;
  while Pos1 <= Len do
  begin
    J := Pos1;
    while (J <= Len) and (ModelList[J] <> ',') do
      J := J + 1;
    Token := Copy(ModelList, Pos1, J - Pos1);
    if DirExists(AddBackslash(Dir) + Token) then
      Result := Result + 1;
    Pos1 := J + 1;
  end;
end;

function BuildModelScanResult(Dir: string): string;
var
  Token: string;
  Pos1, J, Len: Integer;
  ModelList, SubDir: string;
  NL: string;
begin
  NL := Chr(13) + Chr(10);
  Result := '';
  ModelList := MODEL_DIRS;
  Len := Length(ModelList);
  Pos1 := 1;
  while Pos1 <= Len do
  begin
    J := Pos1;
    while (J <= Len) and (ModelList[J] <> ',') do
      J := J + 1;
    Token := Copy(ModelList, Pos1, J - Pos1);
    SubDir := AddBackslash(Dir) + Token;
    if DirExists(SubDir) then
      Result := Result + '  [FOUND]    ' + Token + NL
    else
      Result := Result + '  [MISSING]  ' + Token + NL;
    Pos1 := J + 1;
  end;
end;

procedure CopyModelDirs(SourceDir, DestDir: string);
var
  Token: string;
  Pos1, J, Len: Integer;
  ModelList, Src, Dst: string;
  ResultCode: Integer;
begin
  ModelList := MODEL_DIRS;
  Len := Length(ModelList);
  Pos1 := 1;
  while Pos1 <= Len do
  begin
    J := Pos1;
    while (J <= Len) and (ModelList[J] <> ',') do
      J := J + 1;
    Token := Copy(ModelList, Pos1, J - Pos1);
    Src := AddBackslash(SourceDir) + Token;
    Dst := AddBackslash(DestDir) + Token;
    if DirExists(Src) then
    begin
      ForceDirectories(Dst);
      Exec('xcopy.exe', '"' + Src + '" "' + Dst + '" /E /I /Y /Q', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
    end;
    Pos1 := J + 1;
  end;
end;

procedure InitializeWizard;
var
  NL: string;
begin
  NL := Chr(13) + Chr(10);

  { ── Model source directory selection page (before install) ── }
  ModelDirPage := CreateInputDirPage(wpSelectDir,
    'AI Models Location (Optional)',
    'Do you already have SubMaker AI models downloaded?',
    'If you have previously downloaded SubMaker models, select the folder that contains ' +
    'model sub-folders (turbo, audio-separator, qwen2.5-3b-awq, etc.).' + NL + NL +
    'Leave empty to skip — you can download models later from within the app.' + NL + NL +
    'Expected folder structure:' + NL +
    '  <selected folder>\turbo\' + NL +
    '  <selected folder>\audio-separator\' + NL +
    '  <selected folder>\qwen2.5-3b-awq\' + NL +
    '  <selected folder>\small\' + NL +
    '  ...',
    False, '');
  ModelDirPage.Add('Model source folder (leave empty to skip):');
  ModelDirPage.Values[0] := '';

  { ── Model info page (after install) ── }
  ModelInfoPage := CreateOutputMsgMemoPage(wpInfoAfter,
    'AI Models - Important Notice',
    'SubMaker requires AI models to function. Models are NOT included in this installer.',
    'When you launch SubMaker for the first time, the app will automatically check for ' +
    'missing models and guide you through downloading them.' + NL + NL +
    'You can also manage models anytime from the Startup Health Check screen.',
    'AI MODELS REFERENCE' + NL +
    '========================================' + NL + NL +
    'Models will be stored in:' + NL +
    '  [Install Dir]\resources\resources\models\' + NL + NL +
    '----------------------------------------' + NL +
    'REQUIRED (~2.3 GB):' + NL +
    '  - Whisper Turbo (~1.5 GB) - Speech Recognition' + NL +
    '  - Vocal Separator (~805 MB) - Vocal Isolation' + NL + NL +
    'TRANSLATION (~2.6 GB):' + NL +
    '  - Qwen 2.5 3B AWQ - AI Translation (37+ languages)' + NL + NL +
    'EXTRA WHISPER (~2 GB):' + NL +
    '  - Whisper Small (~464 MB)' + NL +
    '  - Whisper Tiny (~75 MB)' + NL +
    '  - Distil Large v3 (~1.5 GB)' + NL + NL +
    'COVER ART (~22.8 GB):' + NL +
    '  - FLUX.2 Klein 4B (~22.6 GB)' + NL +
    '  - FLUX.2 Small Decoder (~112 MB)' + NL + NL +
    '----------------------------------------' + NL +
    'DOWNLOAD OPTIONS:' + NL + NL +
    '  1. In-App: Launch SubMaker — startup screen auto-checks' + NL +
    '     and offers "Download Missing Models" button' + NL + NL +
    '  2. Start Menu: SubMaker > Download AI Models' + NL +
    '     (Command-line tool for bulk download)' + NL + NL +
    '  3. Command Line:' + NL +
    '     python tools\download_models.py --all' + NL + NL +
    '========================================');
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Dir: string;
  FoundCount: Integer;
  NL, ScanResult: string;
begin
  Result := True;
  if CurPageID = ModelDirPage.ID then
  begin
    Dir := ModelDirPage.Values[0];
    ModelSourcePath := '';
    if Dir = '' then
      Exit;
    if not DirExists(Dir) then
    begin
      MsgBox('The specified folder does not exist:' + #13#10 + Dir, mbError, MB_OK);
      Result := False;
      Exit;
    end;
    NL := Chr(13) + Chr(10);
    FoundCount := CountModelsInDir(Dir);
    ScanResult := BuildModelScanResult(Dir);
    if FoundCount = 0 then
    begin
      if MsgBox('No model folders found in:' + NL + Dir + NL + NL +
                ScanResult + NL +
                'Continue without models?', mbConfirmation, MB_YESNO) = IDNO then
        Result := False
      else
        ModelSourcePath := '';
    end
    else
    begin
      if MsgBox('Found ' + IntToStr(FoundCount) + ' model folder(s):' + NL + NL +
                ScanResult + NL +
                'Copy these models to the installation?', mbConfirmation, MB_YESNO) = IDYES then
        ModelSourcePath := Dir
      else
        ModelSourcePath := '';
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  S, DestModelsDir: string;
begin
  if CurStep = ssPostInstall then
  begin
    { Update placeholder in info page }
    S := ModelInfoPage.RichEditViewer.Lines.Text;
    StringChangeEx(S, '[Install Dir]', ExpandConstant('{app}'), True);
    ModelInfoPage.RichEditViewer.Lines.Text := S;

    { Copy user-supplied models to bundled models directory }
    if ModelSourcePath <> '' then
    begin
      DestModelsDir := ExpandConstant('{app}\resources\resources\models');
      ForceDirectories(DestModelsDir);
      CopyModelDirs(ModelSourcePath, DestModelsDir);
    end;
  end;
end;