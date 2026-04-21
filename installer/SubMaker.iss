; ============================================================================
; SubMaker - Inno Setup Installer Script
; ============================================================================

#define MyAppName      "SubMaker"
#define MyAppVersion   "1.1.0"
#define MyAppPublisher "exedesign"
#define MyAppURL       "https://github.com/exedesign/SubMaker"
#define MyAppExeName   "SubMaker.exe"
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
DiskSpanning=yes
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

[Files]
Source: "..\electron\public\icon.ico"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#StagingDir}\app\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "resources\resources\models\*"
Source: "{#StagingDir}\python\*"; DestDir: "{app}\python"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StagingDir}\ffmpeg\ffmpeg.exe"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "{#StagingDir}\ffmpeg\ffprobe.exe"; DestDir: "{app}\ffmpeg"; Flags: ignoreversion
Source: "{#StagingDir}\presets\*"; DestDir: "{app}\resources\resources\presets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StagingDir}\tools\download_models.py"; DestDir: "{app}\tools"; Flags: ignoreversion
; Bundled AI models (turbo + audio-separator)
Source: "{#StagingDir}\models\turbo\*"; DestDir: "{app}\resources\resources\models\turbo"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#StagingDir}\models\audio-separator\*"; DestDir: "{app}\resources\resources\models\audio-separator"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}";          Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}";     Filename: "{app}\{#MyAppExeName}"; IconFilename: "{app}\icon.ico"

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
  ModelDirPage: TWizardPage;
  ModelDirEdit: TNewEdit;
  ModelSourcePath: string;

const
  MODEL_DIRS = 'turbo,audio-separator,qwen2.5-3b-awq,small,tiny,medium,large-v3,distil-large-v3,flux-klein-4b,flux-small-decoder';

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

procedure ModelDirBrowseClick(Sender: TObject);
var
  Dir: string;
begin
  Dir := ModelDirEdit.Text;
  if BrowseForFolder('Select model folder:', Dir, False) then
    ModelDirEdit.Text := Dir;
end;

procedure InitializeWizard;
begin
  ModelDirPage := CreateCustomPage(wpSelectDir,
    'AI Models (Optional)',
    'Already have models? Select the folder. Otherwise leave empty to skip.');

  with TNewStaticText.Create(ModelDirPage) do
  begin
    Parent := ModelDirPage.Surface;
    Left := 0;
    Top := 0;
    Width := ModelDirPage.SurfaceWidth;
    WordWrap := True;
    AutoSize := True;
    Caption :=
      'Select the folder containing model sub-folders' +
      ' (turbo, audio-separator, qwen2.5-3b-awq, etc.).' + #13#10 + #13#10 +
      'Leave empty to skip - models can be downloaded from within the app.';
  end;

  with TNewStaticText.Create(ModelDirPage) do
  begin
    Parent := ModelDirPage.Surface;
    Left := 0;
    Top := ScaleY(60);
    Width := ModelDirPage.SurfaceWidth;
    Caption := 'Model folder:';
  end;

  ModelDirEdit := TNewEdit.Create(ModelDirPage);
  ModelDirEdit.Parent := ModelDirPage.Surface;
  ModelDirEdit.Left := 0;
  ModelDirEdit.Top := ScaleY(76);
  ModelDirEdit.Width := ModelDirPage.SurfaceWidth - ScaleX(90);
  ModelDirEdit.Text := '';

  with TNewButton.Create(ModelDirPage) do
  begin
    Parent := ModelDirPage.Surface;
    Left := ModelDirEdit.Left + ModelDirEdit.Width + ScaleX(8);
    Top := ScaleY(74);
    Width := ScaleX(80);
    Height := ScaleY(23);
    Caption := 'Browse...';
    OnClick := @ModelDirBrowseClick;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Dir: string;
  FoundCount: Integer;
begin
  Result := True;
  if CurPageID = ModelDirPage.ID then
  begin
    Dir := Trim(ModelDirEdit.Text);
    ModelSourcePath := '';
    if Dir = '' then
      Exit;
    if not DirExists(Dir) then
    begin
      MsgBox('Folder not found: ' + Dir, mbError, MB_OK);
      Result := False;
      Exit;
    end;
    FoundCount := CountModelsInDir(Dir);
    if FoundCount = 0 then
    begin
      if MsgBox('No model folders found here.' + #13#10 + 'Continue without models?',
                mbConfirmation, MB_YESNO) = IDNO then
        Result := False
      else
        ModelSourcePath := '';
    end
    else
    begin
      if MsgBox('Found ' + IntToStr(FoundCount) + ' model folder(s).' + #13#10 +
                'Copy to installation?', mbConfirmation, MB_YESNO) = IDYES then
        ModelSourcePath := Dir
      else
        ModelSourcePath := '';
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  DestModelsDir: string;
begin
  if CurStep = ssPostInstall then
  begin
    if ModelSourcePath <> '' then
    begin
      DestModelsDir := ExpandConstant('{app}\resources\resources\models');
      ForceDirectories(DestModelsDir);
      CopyModelDirs(ModelSourcePath, DestModelsDir);
    end;
  end;
end;
