; SubMaker Inno Setup Installer Script
; Generates a single-file installer with no size limit

#define MyAppName "SubMaker"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "SubMaker"
#define MyAppURL "https://github.com/exedesign/SubMaker"
#define MyAppExeName "SubMaker.exe"

[Setup]
AppId={{B8F3A2D1-5E7C-4A9B-8D6F-1C3E5A7B9D2F}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=public\license.txt
SetupIconFile=public\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
OutputDir=release\build
OutputBaseFilename=SubMaker-Setup-{#MyAppVersion}
Compression=lzma2/fast
SolidCompression=no
LZMANumBlockThreads=4
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
DiskSpanning=no
SetupLogging=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startmenuicon"; Description: "Create a Start Menu shortcut"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "release\build\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: files; Name: "{app}\resources\backend\__pycache__\*"
Type: dirifempty; Name: "{app}\resources\backend\__pycache__"
