$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$installer = Join-Path $projectRoot "release/Glint-$version-windows-x64-setup.exe"
$uninstallRoot = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall'
$existing = @(Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'Glint' })
$shortcut = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Microsoft/Windows/Start Menu/Programs/Glint.lnk'
if ($existing.Count -gt 0 -or (Test-Path -LiteralPath $shortcut)) { throw 'An installed Glint already exists. Run this installer test in a clean Windows user account.' }

$workRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot 'work'))
$testRoot = Join-Path $workRoot ('installer-check-' + [guid]::NewGuid().ToString('N'))
$installDir = [IO.Path]::GetFullPath((Join-Path $testRoot 'app'))
# The uninstaller will recursively remove this directory. Verify its scope first.
if (-not $installDir.StartsWith($workRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe installer test path' }
New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
$previousSmokeRoot = $env:GLINT_SMOKE_ROOT
$previousRunAsNode = $env:ELECTRON_RUN_AS_NODE
try {
  $install = Start-Process -FilePath $installer -ArgumentList "/S /D=$installDir" -WindowStyle Hidden -PassThru -Wait
  if ($install.ExitCode -ne 0) { throw "Installer exit code: $($install.ExitCode)" }
  $exe = Join-Path $installDir 'Glint.exe'
  if (-not (Test-Path -LiteralPath $exe)) { throw 'Installed executable missing' }
  if (-not (Test-Path -LiteralPath $shortcut)) { throw 'Start menu shortcut missing' }
  $env:GLINT_SMOKE_ROOT = $testRoot
  $env:ELECTRON_RUN_AS_NODE = $null
  $app = Start-Process -FilePath $exe -ArgumentList '--package-check' -WindowStyle Hidden -PassThru
  if (-not $app.WaitForExit(60000)) {
    Stop-Process -Id $app.Id -ErrorAction SilentlyContinue
    throw 'Installed application startup timed out'
  }
  if ($app.ExitCode -ne 0) { throw "Installed application exit code: $($app.ExitCode)" }
  $report = Get-Content -LiteralPath (Join-Path $testRoot 'work/smoke-success.json') -Raw | ConvertFrom-Json
  if (-not $report.packaged -or $report.version -ne $version) { throw 'Installed application verification failed' }
} finally {
  $env:GLINT_SMOKE_ROOT = $previousSmokeRoot
  $env:ELECTRON_RUN_AS_NODE = $previousRunAsNode
  $uninstaller = Join-Path $installDir 'Uninstall Glint.exe'
  if (Test-Path -LiteralPath $uninstaller) {
    # _?= prevents spawning a detached temp copy, so we can wait for completion.
    $uninstall = Start-Process -FilePath $uninstaller -ArgumentList "/S _?=$installDir" -WindowStyle Hidden -PassThru -Wait
    if ($uninstall.ExitCode -ne 0) { throw "Uninstaller exit code: $($uninstall.ExitCode)" }
  }
}
if (Test-Path -LiteralPath (Join-Path $installDir 'Glint.exe')) { throw 'Uninstall left the application executable' }
if (Test-Path -LiteralPath $shortcut) { throw 'Uninstall left the Start menu shortcut' }
$remaining = @(Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue | Get-ItemProperty | Where-Object { $_.DisplayName -eq 'Glint' })
if ($remaining.Count -ne 0) { throw 'Uninstall left its registration' }
Write-Output 'Installer, installed startup, Start menu shortcut and uninstall verified.'
