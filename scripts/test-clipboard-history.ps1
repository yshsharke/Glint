param([switch]$Probe)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repoRoot
$vswherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vsInstall = & $vswherePath -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vsInstall) { throw 'Visual Studio C++ tools are required.' }
$vcvarsPath = Join-Path $vsInstall 'VC\Auxiliary\Build\vcvars64.bat'
New-Item -ItemType Directory -Force -Path 'work/history-test' | Out-Null
$compile = '"' + $vcvarsPath + '" >nul && cl /nologo /EHsc /std:c++20 /Inative /Inode_modules/selection-hook/src/windows/lib tests/native/clipboard-history-test.cpp native/clipboard-history.cpp node_modules/selection-hook/src/windows/lib/clipboard.cc /Fework/native-history-test.exe /Fowork/history-test/ /link windowsapp.lib user32.lib ole32.lib gdi32.lib'
& cmd /d /s /c $compile
if ($LASTEXITCODE -ne 0) { throw 'Clipboard history test compilation failed.' }
if ($Probe) { & './work/native-history-test.exe' '--probe' }
else { & './work/native-history-test.exe' }
exit $LASTEXITCODE
