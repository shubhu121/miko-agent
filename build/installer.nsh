; installer.nsh - NSIS custom hooks for Miko installer
;
; Owns the Windows overlay boundary for Miko installs. The installer may
; replace Miko-owned program files, while user/runtime state stays outside
; $INSTDIR.

; Disable CRC integrity check. electron-builder's post-compilation PE editing
; (signtool + rcedit) corrupts the NSIS CRC when no signing cert is configured,
; causing "Installer integrity check has failed" on Windows.
CRCCheck off

!include LogicLib.nsh

!macro mikoInstallTimingMark _PHASE _EVENT
  Push $0
  Push $1
  InitPluginsDir
  System::Call 'kernel32::GetTickCount() i.r0'
  FileOpen $1 "$PLUGINSDIR\miko-install-timing.log" a
  ${IfNot} ${Errors}
    FileWrite $1 "tickMs=$0 phase=${_PHASE} event=${_EVENT}$\r$\n"
    FileClose $1
  ${EndIf}
  ClearErrors
  Pop $1
  Pop $0
!macroend

!macro mikoPersistInstallTiming
  IfFileExists "$PLUGINSDIR\miko-install-timing.log" 0 +2
    CopyFiles /SILENT "$PLUGINSDIR\miko-install-timing.log" "$INSTDIR\miko-install-timing.log"
!macroend

!macro mikoFindProcess _NAME _RETURN
  nsExec::ExecToLog `"$SYSDIR\cmd.exe" /D /C tasklist /FI "IMAGENAME eq ${_NAME}" /FO CSV | "$SYSDIR\find.exe" "${_NAME}"`
  Pop ${_RETURN}
!macroend

!macro mikoFindRunningProcesses _RETURN
  !insertmacro mikoFindProcess Miko.exe ${_RETURN}
  ${If} ${_RETURN} != 0
    !insertmacro mikoFindProcess Miko.exe ${_RETURN}
  ${EndIf}
  ${If} ${_RETURN} != 0
    !insertmacro mikoFindProcess miko-server.exe ${_RETURN}
  ${EndIf}
!macroend

!macro mikoKillProcess _NAME _FORCE
  Push $0
  Push $1
  ${If} ${_FORCE} == 1
    StrCpy $0 "/F"
  ${Else}
    StrCpy $0 ""
  ${EndIf}
  nsExec::ExecToLog `"$SYSDIR\cmd.exe" /D /C taskkill $0 /T /IM "${_NAME}"`
  Pop $1
  Pop $1
  Pop $0
!macroend

!macro mikoKillRunningProcesses _FORCE
  !insertmacro mikoKillProcess Miko.exe ${_FORCE}
  !insertmacro mikoKillProcess Miko.exe ${_FORCE}
  !insertmacro mikoKillProcess miko-server.exe ${_FORCE}
!macroend

!macro mikoRequireInstallSurfaceFile _PATH _LABEL
  IfFileExists "${_PATH}" +2 0
    StrCpy $R2 "$R2$\r$\n- ${_LABEL}: ${_PATH}"
!macroend

; English onlyEnglish onlyEnglish only server-<version>-<platform>-<arch>.tar.gzEnglish onlyEnglish only
; English onlyEnglish onlyEnglish only FindFirst/FindClose English onlyEnglish onlyEnglish only+English only
; English onlyEnglish onlyEnglish only mikoRequireInstallSurfaceFile English only/English onlyEnglish only
!macro mikoRequireInstallSurfaceGlob _DIR _PATTERN _LABEL
  Push $R3
  Push $R4
  ClearErrors
  FindFirst $R3 $R4 "${_DIR}\${_PATTERN}"
  ${If} $R4 == ""
    StrCpy $R2 "$R2$\r$\n- ${_LABEL}: ${_DIR}\${_PATTERN}"
  ${EndIf}
  ; FindFirst English only handleEnglish onlyNSIS English onlyEnglish only
  ; English onlyEnglish onlyEnglish onlyEnglish onlyhandle English only FindClose English onlyEnglish only
  ${If} $R3 != ""
    FindClose $R3
  ${EndIf}
  ClearErrors
  Pop $R4
  Pop $R3
!macroend

!macro mikoVerifyInstallSurface
  !insertmacro mikoInstallTimingMark "installSurfaceSelfCheck" "start"
  Push $0
  Push $R2
  StrCpy $R2 ""
  !insertmacro mikoRequireInstallSurfaceFile "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "Miko.exe"
  !insertmacro mikoRequireInstallSurfaceFile "$INSTDIR\resources\app.asar" "resources\app.asar"
  !insertmacro mikoRequireInstallSurfaceFile "$INSTDIR\resources\app-update.yml" "resources\app-update.yml"
  ; manifest English onlyEnglish onlyseed-train-<platform>-<arch>.jsonEnglish onlyEnglish only
  ; scripts/build-server-artifact.mjs English only seedManifestFileNameEnglish onlyEnglish only
  ; English onlyEnglish onlyEnglish onlyEnglish only
  !insertmacro mikoRequireInstallSurfaceGlob "$INSTDIR\resources\seed" "seed-train-*.json" "resources\seed\seed-train-*.json"
  !insertmacro mikoRequireInstallSurfaceGlob "$INSTDIR\resources\seed" "seed-train-*.json.sig" "resources\seed\seed-train-*.json.sig"
  !insertmacro mikoRequireInstallSurfaceGlob "$INSTDIR\resources\seed" "server-*.tar.gz" "resources\seed\server-*.tar.gz"
  !insertmacro mikoRequireInstallSurfaceGlob "$INSTDIR\resources\seed" "renderer-*.tar.gz" "resources\seed\renderer-*.tar.gz"
  !insertmacro mikoRequireInstallSurfaceFile "$INSTDIR\resources\git\cmd\git.exe" "MinGit git.exe"
  !insertmacro mikoRequireInstallSurfaceFile "$INSTDIR\resources\git\usr\bin\sh.exe" "MinGit sh.exe"

  ${If} $R2 != ""
    DetailPrint "Miko install surface self-check failed."
    FileOpen $0 "$INSTDIR\miko-install-diagnostics.log" w
    FileWrite $0 "Miko install surface self-check failed.$\r$\n"
    FileWrite $0 "Install dir: $INSTDIR$\r$\n"
    FileWrite $0 "Missing or unreadable files:$R2$\r$\n"
    FileClose $0
    MessageBox MB_OK|MB_ICONSTOP "Miko installation is incomplete. Missing or unreadable files:$R2$\r$\n$\r$\nDiagnostic file:$\r$\n$INSTDIR\miko-install-diagnostics.log"
    SetErrorLevel 1
    !insertmacro mikoInstallTimingMark "installSurfaceSelfCheck" "failed"
    !insertmacro mikoPersistInstallTiming
    Pop $R2
    Pop $0
    Quit
  ${Else}
    Delete "$INSTDIR\miko-install-diagnostics.log"
    Delete "$INSTDIR\miko-install-diagnostics.log"
    DetailPrint "Miko install surface self-check passed."
  ${EndIf}
  Pop $R2
  Pop $0
  !insertmacro mikoInstallTimingMark "installSurfaceSelfCheck" "end"
!macroend

!macro mikoWriteInstallDirProcessCleaner _SCRIPT
  Push $0
  FileOpen $0 "${_SCRIPT}" w
  FileWrite $0 `$$ErrorActionPreference = 'SilentlyContinue'$\r$\n`
  FileWrite $0 `$$installDir = [Environment]::GetEnvironmentVariable('MIKO_INSTALL_DIR')$\r$\n`
  FileWrite $0 `if ([string]::IsNullOrWhiteSpace($$installDir)) { exit 0 }$\r$\n`
  FileWrite $0 `$$installFull = [System.IO.Path]::GetFullPath($$installDir).TrimEnd('\')$\r$\n`
  FileWrite $0 `$$installPrefix = $$installFull + '\'$\r$\n`
  FileWrite $0 `$$selfPid = $$PID$\r$\n`
  FileWrite $0 `$$self = Get-CimInstance Win32_Process -Filter "ProcessId = $$selfPid"$\r$\n`
  FileWrite $0 `$$installerPid = if ($$self) { $$self.ParentProcessId } else { -1 }$\r$\n`
  FileWrite $0 `function Test-MikoPath([string]$$value) {$\r$\n`
  FileWrite $0 `  if ([string]::IsNullOrWhiteSpace($$value)) { return $$false }$\r$\n`
  FileWrite $0 `  try {$\r$\n`
  FileWrite $0 `    $$full = [System.IO.Path]::GetFullPath($$value)$\r$\n`
  FileWrite $0 `    return $$full.Equals($$installFull, [StringComparison]::OrdinalIgnoreCase) -or $$full.StartsWith($$installPrefix, [StringComparison]::OrdinalIgnoreCase)$\r$\n`
  FileWrite $0 `  } catch { return $$false }$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileWrite $0 `function Test-MikoCommand([string]$$value) {$\r$\n`
  FileWrite $0 `  if ([string]::IsNullOrWhiteSpace($$value)) { return $$false }$\r$\n`
  FileWrite $0 `  $$quotedPrefix = '"' + $$installPrefix$\r$\n`
  FileWrite $0 `  return $$value.StartsWith($$installPrefix, [StringComparison]::OrdinalIgnoreCase) -or $$value.IndexOf($$quotedPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $$value.IndexOf(' ' + $$installPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileWrite $0 `Get-CimInstance Win32_Process | Where-Object {$\r$\n`
  FileWrite $0 `  $$_.ProcessId -ne $$selfPid -and $$_.ProcessId -ne $$installerPid -and ((Test-MikoPath $$_.ExecutablePath) -or (Test-MikoCommand $$_.CommandLine))$\r$\n`
  FileWrite $0 `} | ForEach-Object {$\r$\n`
  FileWrite $0 `  Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileClose $0
  Pop $0
!macroend

!macro mikoWriteInstallDirProcessFinder _SCRIPT
  Push $0
  FileOpen $0 "${_SCRIPT}" w
  FileWrite $0 `$$ErrorActionPreference = 'SilentlyContinue'$\r$\n`
  FileWrite $0 `$$installDir = [Environment]::GetEnvironmentVariable('MIKO_INSTALL_DIR')$\r$\n`
  FileWrite $0 `if ([string]::IsNullOrWhiteSpace($$installDir)) { exit 3 }$\r$\n`
  FileWrite $0 `$$installFull = [System.IO.Path]::GetFullPath($$installDir).TrimEnd('\')$\r$\n`
  FileWrite $0 `$$installPrefix = $$installFull + '\'$\r$\n`
  FileWrite $0 `$$selfPid = $$PID$\r$\n`
  FileWrite $0 `$$self = Get-CimInstance Win32_Process -Filter "ProcessId = $$selfPid"$\r$\n`
  FileWrite $0 `$$installerPid = if ($$self) { $$self.ParentProcessId } else { -1 }$\r$\n`
  FileWrite $0 `function Test-MikoPath([string]$$value) {$\r$\n`
  FileWrite $0 `  if ([string]::IsNullOrWhiteSpace($$value)) { return $$false }$\r$\n`
  FileWrite $0 `  try {$\r$\n`
  FileWrite $0 `    $$full = [System.IO.Path]::GetFullPath($$value)$\r$\n`
  FileWrite $0 `    return $$full.Equals($$installFull, [StringComparison]::OrdinalIgnoreCase) -or $$full.StartsWith($$installPrefix, [StringComparison]::OrdinalIgnoreCase)$\r$\n`
  FileWrite $0 `  } catch { return $$false }$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileWrite $0 `function Test-MikoCommand([string]$$value) {$\r$\n`
  FileWrite $0 `  if ([string]::IsNullOrWhiteSpace($$value)) { return $$false }$\r$\n`
  FileWrite $0 `  $$quotedPrefix = '"' + $$installPrefix$\r$\n`
  FileWrite $0 `  return $$value.StartsWith($$installPrefix, [StringComparison]::OrdinalIgnoreCase) -or $$value.IndexOf($$quotedPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or $$value.IndexOf(' ' + $$installPrefix, [StringComparison]::OrdinalIgnoreCase) -ge 0$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileWrite $0 `$$all = $$null$\r$\n`
  FileWrite $0 `try { $$all = @(Get-CimInstance Win32_Process -ErrorAction Stop) } catch { exit 2 }$\r$\n`
  FileWrite $0 `if ($$all.Count -eq 0) { exit 2 }$\r$\n`
  FileWrite $0 `$$matches = @($$all | Where-Object {$\r$\n`
  FileWrite $0 `  $$_.ProcessId -ne $$selfPid -and $$_.ProcessId -ne $$installerPid -and ((Test-MikoPath $$_.ExecutablePath) -or (Test-MikoCommand $$_.CommandLine))$\r$\n`
  FileWrite $0 `})$\r$\n`
  FileWrite $0 `$$matches | ForEach-Object {$\r$\n`
  FileWrite $0 `  Write-Output ("Miko-owned process still running: {0} pid={1} path={2}" -f $$_.Name, $$_.ProcessId, $$_.ExecutablePath)$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileWrite $0 `if ($$matches.Count -gt 0) { exit 0 } else { exit 10 }$\r$\n`
  FileClose $0
  Pop $0
!macroend

!macro mikoStopInstallDirProcesses
  ; Stop every process launched from this install root. This catches renamed
  ; helper processes and stale child processes that do not use fixed image names.
  !insertmacro mikoInstallTimingMark "stopInstallDirProcesses" "start"
  Push $0
  Push $1
  InitPluginsDir
  StrCpy $1 "$PLUGINSDIR\miko-stop-install-dir.ps1"
  !insertmacro mikoWriteInstallDirProcessCleaner "$1"
  System::Call 'kernel32::SetEnvironmentVariable(t "MIKO_INSTALL_DIR", t "$INSTDIR") i.r0'
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$1"`
  Pop $0
  Pop $1
  Pop $0
  !insertmacro mikoInstallTimingMark "stopInstallDirProcesses" "end"
!macroend

!macro mikoFindInstallDirProcesses _RETURN
  !insertmacro mikoInstallTimingMark "findInstallDirProcesses" "start"
  Push $0
  Push $1
  InitPluginsDir
  StrCpy $1 "$PLUGINSDIR\miko-find-install-dir.ps1"
  !insertmacro mikoWriteInstallDirProcessFinder "$1"
  System::Call 'kernel32::SetEnvironmentVariable(t "MIKO_INSTALL_DIR", t "$INSTDIR") i.r0'
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$1"`
  Pop ${_RETURN}
  Pop $1
  Pop $0
  !insertmacro mikoInstallTimingMark "findInstallDirProcesses" "end"
!macroend

!macro mikoBypassOldUninstallerForUpdate
  ${If} ${isUpdated}
    DetailPrint "Update mode detected; bypassing the previous uninstaller and preparing a Miko-owned overlay."
    !insertmacro mikoPrepareOwnedOverlay
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
    !endif
    ClearErrors
  ${EndIf}
!macroend

!macro customInstallMode
  ${If} ${isUpdated}
    ${If} $installMode == "all"
      StrCpy $isForceMachineInstall "1"
    ${Else}
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  !insertmacro mikoInstallTimingMark "customInstall" "start"
  !insertmacro mikoVerifyInstallSurface
  !insertmacro mikoInstallTimingMark "customInstall" "end"
  !insertmacro mikoPersistInstallTiming
  ${If} ${isUpdated}
  ${AndIf} ${isForceRun}
    !insertmacro mikoInstallTimingMark "relaunch" "start"
    !insertmacro mikoPersistInstallTiming
    HideWindow
    StrCpy $1 "--updated"
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  ${EndIf}
!macroend

!macro customFinishPage
  !ifndef HIDE_RUN_AFTER_FINISH
    Function StartApp
      ${if} ${isUpdated}
        StrCpy $1 "--updated"
      ${else}
        StrCpy $1 ""
      ${endif}
      ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
    FunctionEnd

    !define MUI_FINISHPAGE_RUN
    !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !endif

  !insertmacro skipPageIfUpdated
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customCheckAppRunning
  !insertmacro mikoInstallTimingMark "customCheckAppRunning" "start"
  !insertmacro mikoBypassOldUninstallerForUpdate
  !insertmacro mikoStopInstallDirProcesses
  ; Finder exit contract: 0 = found Miko-owned processes, 10 = confirmed
  ; none, anything else = query unavailable (PowerShell blocked / WMI broken).
  ; $R9 = 1 when the query is unavailable and we must fall back to the
  ; cmd-based image-name sweep below.
  StrCpy $R9 0
  !insertmacro mikoFindInstallDirProcesses $R0
  ${If} $R0 == 0
    DetailPrint "Detected Miko-owned process in install directory; closing it before install."
    Sleep 500
    !insertmacro mikoStopInstallDirProcesses

    StrCpy $R1 0
    miko_check_install_dir_processes:
      !insertmacro mikoFindInstallDirProcesses $R0
      ${If} $R0 == 0
        IntOp $R1 $R1 + 1
        DetailPrint "Waiting for Miko-owned install-directory processes to close."
        ${If} $R1 > 2
          DetailPrint "Miko-owned install-directory processes still running; asking user to retry."
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY miko_retry_install_dir_close
          Quit
          miko_retry_install_dir_close:
          StrCpy $R1 0
        ${EndIf}
        !insertmacro mikoStopInstallDirProcesses
        Sleep 1000
        Goto miko_check_install_dir_processes
      ${ElseIf} $R0 != 10
        DetailPrint "Miko process query became unavailable (code $R0); switching to image-name cleanup."
        StrCpy $R9 1
      ${EndIf}
  ${ElseIf} $R0 != 10
    DetailPrint "Miko process query unavailable (code $R0); falling back to image-name cleanup."
    StrCpy $R9 1
  ${EndIf}

  ; Image-name sweep runs for fresh installs (legacy behavior), and for
  ; updates whenever the precise install-dir query is unavailable.
  StrCpy $R8 0
  ${If} $R9 == 1
    StrCpy $R8 1
  ${EndIf}
  ${IfNot} ${isUpdated}
    StrCpy $R8 1
  ${EndIf}

  ${If} $R8 == 1
  !insertmacro mikoFindRunningProcesses $R0
  ${If} $R0 == 0
    DetailPrint "Detected Miko.exe, Miko.exe, or miko-server.exe; closing them before install."
    !insertmacro mikoKillRunningProcesses 0
    Sleep 500

    !insertmacro mikoFindRunningProcesses $R0
    ${If} $R0 == 0
      !insertmacro mikoKillRunningProcesses 1
      Sleep 1000
    ${EndIf}

    StrCpy $R1 0
    miko_check_processes:
      !insertmacro mikoFindRunningProcesses $R0
      ${If} $R0 == 0
        IntOp $R1 $R1 + 1
        DetailPrint "Waiting for Miko.exe, Miko.exe, or miko-server.exe to close."
        ${If} $R1 > 2
          DetailPrint "Miko.exe, Miko.exe, or miko-server.exe still running; asking user to retry."
          MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY miko_retry_close
          Quit
          miko_retry_close:
          StrCpy $R1 0
        ${EndIf}
        !insertmacro mikoKillRunningProcesses 1
        Sleep 1000
        Goto miko_check_processes
      ${EndIf}
  ${EndIf}
  ${EndIf}
  !insertmacro mikoInstallTimingMark "customCheckAppRunning" "end"
!macroend

!macro mikoCleanBundledServer
  ; English only resources\seed English only + English onlyEnglish onlyEnglish only resources\server English only
  ; English onlyEnglish onlyEnglish onlyEnglish onlyEnglish only
  ; English onlyEnglish onlyEnglish only mikoRemoveOwnedInstallTreesEnglish only
  IfFileExists "$INSTDIR\resources\server\*.*" 0 +3
    DetailPrint "Removing old bundled server resources"
    RMDir /r "$INSTDIR\resources\server"
!macroend

!macro mikoWriteLegacyShortcutCleaner _SCRIPT
  Push $0
  FileOpen $0 "${_SCRIPT}" w
  FileWrite $0 `$$ErrorActionPreference = 'SilentlyContinue'$\r$\n`
  FileWrite $0 `$$installDir = [Environment]::GetEnvironmentVariable('MIKO_INSTALL_DIR')$\r$\n`
  FileWrite $0 `if ([string]::IsNullOrWhiteSpace($$installDir)) { exit 0 }$\r$\n`
  FileWrite $0 `$$installFull = [System.IO.Path]::GetFullPath($$installDir).TrimEnd('\')$\r$\n`
  FileWrite $0 `$$installPrefix = $$installFull + '\'$\r$\n`
  FileWrite $0 `$$shell = New-Object -ComObject WScript.Shell$\r$\n`
  FileWrite $0 `function Test-MikoInstallPath([string]$$value) {$\r$\n`
  FileWrite $0 `  if ([string]::IsNullOrWhiteSpace($$value)) { return $$false }$\r$\n`
  FileWrite $0 `  try {$\r$\n`
  FileWrite $0 `    $$expanded = [Environment]::ExpandEnvironmentVariables($$value)$\r$\n`
  FileWrite $0 `    $$full = [System.IO.Path]::GetFullPath($$expanded)$\r$\n`
  FileWrite $0 `    return $$full.Equals($$installFull, [StringComparison]::OrdinalIgnoreCase) -or $$full.StartsWith($$installPrefix, [StringComparison]::OrdinalIgnoreCase)$\r$\n`
  FileWrite $0 `  } catch { return $$false }$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileWrite $0 `function Remove-OwnedShortcut([string]$$path) {$\r$\n`
  FileWrite $0 `  if ([string]::IsNullOrWhiteSpace($$path)) { return }$\r$\n`
  FileWrite $0 `  if (-not (Test-Path -LiteralPath $$path -PathType Leaf)) { return }$\r$\n`
  FileWrite $0 `  try {$\r$\n`
  FileWrite $0 `    $$shortcut = $$shell.CreateShortcut($$path)$\r$\n`
  FileWrite $0 `    if ((Test-MikoInstallPath $$shortcut.TargetPath) -or (Test-MikoInstallPath $$shortcut.WorkingDirectory)) {$\r$\n`
  FileWrite $0 `      Remove-Item -LiteralPath $$path -Force$\r$\n`
  FileWrite $0 `    }$\r$\n`
  FileWrite $0 `  } catch {}$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileWrite $0 `Remove-OwnedShortcut ([Environment]::GetEnvironmentVariable('MIKO_DESKTOP_LEGACY_SHORTCUT'))$\r$\n`
  FileWrite $0 `Remove-OwnedShortcut ([Environment]::GetEnvironmentVariable('MIKO_STARTMENU_LEGACY_SHORTCUT'))$\r$\n`
  FileWrite $0 `$$legacyDir = [Environment]::GetEnvironmentVariable('MIKO_STARTMENU_LEGACY_DIR')$\r$\n`
  FileWrite $0 `if (-not [string]::IsNullOrWhiteSpace($$legacyDir) -and (Test-Path -LiteralPath $$legacyDir -PathType Container)) {$\r$\n`
  FileWrite $0 `  Get-ChildItem -LiteralPath $$legacyDir -Filter '*.lnk' | Where-Object { -not $$_.PSIsContainer } | ForEach-Object { Remove-OwnedShortcut $$_.FullName }$\r$\n`
  FileWrite $0 `  try { Remove-Item -LiteralPath $$legacyDir -Force -ErrorAction Stop } catch {}$\r$\n`
  FileWrite $0 `}$\r$\n`
  FileClose $0
  Pop $0
!macroend

!macro mikoRemoveLegacyGlobalShortcuts
  !insertmacro mikoInstallTimingMark "legacyShortcutCleanup" "start"
  Push $0
  Push $1
  InitPluginsDir
  StrCpy $1 "$PLUGINSDIR\miko-clean-legacy-shortcuts.ps1"
  !insertmacro mikoWriteLegacyShortcutCleaner "$1"
  System::Call 'kernel32::SetEnvironmentVariable(t "MIKO_INSTALL_DIR", t "$INSTDIR") i.r0'
  System::Call 'kernel32::SetEnvironmentVariable(t "MIKO_DESKTOP_LEGACY_SHORTCUT", t "$DESKTOP\Miko.lnk") i.r0'
  System::Call 'kernel32::SetEnvironmentVariable(t "MIKO_STARTMENU_LEGACY_SHORTCUT", t "$SMPROGRAMS\Miko.lnk") i.r0'
  System::Call 'kernel32::SetEnvironmentVariable(t "MIKO_STARTMENU_LEGACY_DIR", t "$SMPROGRAMS\Miko") i.r0'
  nsExec::ExecToLog `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$1"`
  Pop $0
  Pop $1
  Pop $0
  !insertmacro mikoInstallTimingMark "legacyShortcutCleanup" "end"
!macroend

!macro mikoRemoveOwnedInstallTrees
  !insertmacro mikoInstallTimingMark "removeOwnedInstallTrees" "start"
  DetailPrint "Removing Miko-owned install files"
  SetOutPath "$TEMP"
  ; English only resources\server English onlyEnglish onlyEnglish only resources\seed English onlyEnglish only
  ; English onlyEnglish onlyEnglish onlyEnglish only
  RMDir /r "$INSTDIR\resources\server"
  RMDir /r "$INSTDIR\resources\git"
  RMDir /r "$INSTDIR\resources\screenshot-themes"
  RMDir /r "$INSTDIR\resources\app"
  RMDir /r "$INSTDIR\resources\app.asar.unpacked"
  Delete "$INSTDIR\resources\app.asar"
  Delete "$INSTDIR\resources\app-update.yml"
  Delete "$INSTDIR\resources\elevate.exe"
  RMDir "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"
  RMDir /r "$INSTDIR\swiftshader"
  Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  Delete "$INSTDIR\Miko.exe"
  Delete "$INSTDIR\Uninstall Miko.exe"
  Delete "$INSTDIR\miko-install-diagnostics.log"
  Delete "$INSTDIR\uninstallerIcon.ico"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.json"
  Delete "$INSTDIR\*.html"
  Delete "$INSTDIR\LICENSE*"
  Delete "$INSTDIR\*.ico"
  !insertmacro mikoInstallTimingMark "removeOwnedInstallTrees" "end"
!macroend

!macro mikoPrepareOwnedOverlay
  !insertmacro mikoInstallTimingMark "prepareOwnedOverlay" "start"
  !insertmacro mikoStopInstallDirProcesses
  !insertmacro mikoRemoveOwnedInstallTrees
  ClearErrors
  !insertmacro mikoInstallTimingMark "prepareOwnedOverlay" "end"
!macroend

!macro customInit
  !insertmacro mikoInstallTimingMark "customInit" "start"
  !insertmacro mikoStopInstallDirProcesses
  ; Wait for file handles to release.
  Sleep 2000
  !insertmacro mikoInstallTimingMark "customInit" "end"
!macroend

!macro customUnInstallCheck
  !insertmacro mikoInstallTimingMark "customUnInstallCheck" "start"
  ${If} ${Errors}
    DetailPrint `Previous uninstaller could not be launched; preparing a Miko-owned overlay.`
  ${ElseIf} $R0 != 0
    DetailPrint `Previous uninstaller exited with code $R0; preparing a Miko-owned overlay.`
  ${EndIf}
  !insertmacro mikoPrepareOwnedOverlay
  ClearErrors
  !insertmacro mikoInstallTimingMark "customUnInstallCheck" "end"
!macroend

!macro customUnInstallCheckCurrentUser
  !insertmacro mikoInstallTimingMark "customUnInstallCheckCurrentUser" "start"
  ${If} ${Errors}
    DetailPrint `Previous current-user uninstaller could not be launched; continuing with Miko-owned overlay.`
  ${ElseIf} $R0 != 0
    DetailPrint `Previous current-user uninstaller exited with code $R0; continuing with Miko-owned overlay.`
  ${EndIf}
  !insertmacro mikoPrepareOwnedOverlay
  ClearErrors
  !insertmacro mikoInstallTimingMark "customUnInstallCheckCurrentUser" "end"
!macroend

!macro customRemoveFiles
  !insertmacro mikoInstallTimingMark "customRemoveFiles" "start"
  !insertmacro mikoStopInstallDirProcesses
  Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  !insertmacro mikoRemoveOwnedInstallTrees
  RMDir "$INSTDIR"
  !insertmacro mikoInstallTimingMark "customRemoveFiles" "end"
!macroend

!macro customUnInit
  !insertmacro mikoInstallTimingMark "customUnInit" "start"
  !insertmacro mikoStopInstallDirProcesses
  Sleep 2000
  !insertmacro mikoInstallTimingMark "customUnInit" "end"
!macroend
