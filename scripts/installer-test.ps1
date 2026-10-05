param([Parameter(Mandatory=$true)][ValidateSet('install','uninstall')][string]$Action, [Parameter(Mandatory=$true)][string]$Target, [Parameter(Mandatory=$true)][string]$DataDirectory)
$ErrorActionPreference = 'Stop'
$workspacePath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$testRoot = [IO.Path]::GetFullPath((Join-Path $workspacePath '.tools\installer-test')) + [IO.Path]::DirectorySeparatorChar
$installPath = [IO.Path]::GetFullPath($Target)
$profilePath = [IO.Path]::GetFullPath($DataDirectory)
if (-not $installPath.StartsWith($testRoot, [StringComparison]::OrdinalIgnoreCase) -or -not $profilePath.StartsWith($testRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Las rutas de instalación y perfil deben permanecer dentro de la carpeta de pruebas del proyecto.' }
$registryRoots = @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKCU:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')
function InstalledTutor {
  @($registryRoots | ForEach-Object { Get-ChildItem -LiteralPath $_ -ErrorAction SilentlyContinue | Get-ItemProperty -ErrorAction SilentlyContinue } | Where-Object { $_.DisplayName -like 'Tutor Local*' })
}
function TargetsTest($entry) { $entry.UninstallString -eq ('"' + (Join-Path $installPath 'Uninstall Tutor Local.exe') + '" /currentuser') }
$current = @(InstalledTutor)
$env:TUTOR_DATA_DIR = $profilePath
$env:TUTOR_SMOKE = '1'
if ($Action -eq 'install') {
  if ($current.Count -ne 0) { throw 'Existe una instalación de Tutor Local. La prueba no puede sustituirla.' }
  $desktopLink = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'Tutor Local.lnk'
  $menuLink = Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Tutor Local.lnk'
  if ((Test-Path -LiteralPath $desktopLink) -or (Test-Path -LiteralPath $menuLink)) { throw 'Existe un acceso directo anterior. La prueba no puede sustituirlo.' }
  $packageInfo = Get-Content -LiteralPath (Join-Path $workspacePath 'package.json') -Raw | ConvertFrom-Json
  $installerPath = Join-Path $workspacePath ('release\Tutor-Local-' + $packageInfo.version + '-Instalador.exe')
  if (-not (Test-Path -LiteralPath $installerPath)) { throw 'Falta el instalador verificado.' }
  # NSIS: /D must be last and unquoted, even when the target includes spaces.
  # https://nsis.sourceforge.io/Docs/Chapter3.html#3.2.1
  $installerProcess = Start-Process -FilePath $installerPath -ArgumentList @('/S', ('/D=' + $installPath)) -WindowStyle Hidden -PassThru -Wait
  if ($installerProcess.ExitCode -ne 0) { throw ('La instalación silenciosa ha fallado: ' + $installerProcess.ExitCode) }
  $registered = @(InstalledTutor)
  if ($registered.Count -ne 1 -or -not (TargetsTest $registered[0])) { throw 'La instalación no registró exclusivamente la carpeta de pruebas.' }
  [pscustomobject]@{ action='install'; exitCode=$installerProcess.ExitCode; target=$installPath; registered=$true; desktopShortcut=(Test-Path -LiteralPath $desktopLink); startMenuShortcut=(Test-Path -LiteralPath $menuLink) } | ConvertTo-Json -Compress
} else {
  if ($current.Count -ne 1 -or -not (TargetsTest $current[0])) { throw 'El desinstalador no puede actuar sobre una instalación ajena a esta prueba.' }
  $uninstallerPath = [IO.Path]::GetFullPath((Join-Path $installPath 'Uninstall Tutor Local.exe'))
  if (-not $uninstallerPath.StartsWith($testRoot, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $uninstallerPath)) { throw 'No se encuentra el desinstalador dentro de la carpeta verificada.' }
  $uninstallerProcess = Start-Process -FilePath $uninstallerPath -ArgumentList @('/S', ('_?=' + $installPath)) -WindowStyle Hidden -PassThru -Wait
  if ($uninstallerProcess.ExitCode -ne 0 -or @(InstalledTutor).Count -ne 0 -or (Test-Path -LiteralPath (Join-Path $installPath 'Tutor Local.exe'))) { throw 'La limpieza de la instalación de pruebas no terminó correctamente.' }
  [pscustomobject]@{ action='uninstall'; exitCode=$uninstallerProcess.ExitCode; removed=$true; profilePreserved=(Test-Path -LiteralPath (Join-Path $profilePath 'learning.tutor')) } | ConvertTo-Json -Compress
}
