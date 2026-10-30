Unicode true
RequestExecutionLevel user
SilentInstall silent
AutoCloseWindow true
Name "Tutor Local"
OutFile "${OUTPUT}"
Icon "${ICON}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=1033 "ProductName" "Tutor Local"
VIAddVersionKey /LANG=1033 "FileDescription" "Tutor Local portable launcher"
VIAddVersionKey /LANG=1033 "FileVersion" "${VERSION}"
!include "FileFunc.nsh"

Section
  IfFileExists "$EXEDIR\App\Tutor Local.exe" 0 missing
  IfFileExists "$EXEDIR\App\tutor-portable.json" 0 missing
  ${GetParameters} $R0
  SetOutPath "$EXEDIR\App"
  ClearErrors
  ExecWait '"$EXEDIR\App\Tutor Local.exe" $R0' $R1
  IfErrors failed
  SetErrorLevel $R1
  Quit
missing:
  MessageBox MB_OK|MB_ICONSTOP "Falta la carpeta App. Extrae el ZIP completo y conserva todas sus carpetas junto a Tutor Local.exe."
  SetErrorLevel 1
  Quit
failed:
  MessageBox MB_OK|MB_ICONSTOP "No se pudo abrir Tutor Local. Comprueba que el ZIP se haya extraído por completo."
  SetErrorLevel 1
SectionEnd
