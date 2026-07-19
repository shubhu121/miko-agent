import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const root = process.cwd();

function extractMacro(source, name) {
  const match = source.match(new RegExp(`!macro ${name}(?:\\s|$)[\\s\\S]*?!macroend`));
  return match?.[0] || "";
}

describe("Windows NSIS installer contract", () => {
  it("does not let stale old-uninstaller failures abort a Miko-owned overlay", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const macro = extractMacro(source, "customUnInstallCheck");

    expect(macro).toContain("mikoPrepareOwnedOverlay");
    expect(macro).toContain("ClearErrors");
    expect(macro).not.toContain("$(uninstallFailed)");
    expect(macro).not.toContain("Quit");
  });

  it("bypasses the previous uninstaller in electron-updater mode", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const bypass = extractMacro(source, "mikoBypassOldUninstallerForUpdate");
    const checkRunning = extractMacro(source, "customCheckAppRunning");

    expect(checkRunning).toContain("mikoBypassOldUninstallerForUpdate");
    expect(bypass).toContain("${isUpdated}");
    expect(bypass).toContain("mikoPrepareOwnedOverlay");
    expect(bypass).toContain('DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"');
  });

  it("cleans the retired scattered server tree left behind by pre-seed installs before overlaying new files", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");

    expect(source).toContain('RMDir /r "$INSTDIR\\resources\\server"');
  });

  it("removes legacy unpacked Electron app directories before overlaying new files", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const macro = extractMacro(source, "mikoRemoveOwnedInstallTrees");

    expect(macro).toContain('RMDir /r "$INSTDIR\\resources\\app"');
  });

  it("cleans processes by install-directory ownership, not only fixed image names", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const macro = extractMacro(source, "mikoStopInstallDirProcesses");
    const cleaner = extractMacro(source, "mikoWriteInstallDirProcessCleaner");

    expect(macro).toContain("MIKO_INSTALL_DIR");
    expect(macro).toContain("mikoWriteInstallDirProcessCleaner");
    expect(cleaner).toContain("Get-CimInstance Win32_Process");
    expect(cleaner).toContain("CommandLine");
    expect(cleaner).toContain("Stop-Process");
  });

  it("escapes PowerShell variables written through NSIS FileWrite", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const cleaner = extractMacro(source, "mikoWriteInstallDirProcessCleaner");
    const fileWrites = cleaner
      .split("\n")
      .filter((line) => line.includes("FileWrite"))
      .join("\n");

    expect(fileWrites).toContain("$$_.CommandLine");
    expect(fileWrites).toContain("$$installDir");
    expect(fileWrites).not.toMatch(/(^|[^$])\$(?:_|install|self|PID|false|value|full)/);
  });

  it("does not classify the running installer as a stale app process via the /D argument", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const cleaner = extractMacro(source, "mikoWriteInstallDirProcessCleaner");
    const finder = extractMacro(source, "mikoWriteInstallDirProcessFinder");

    for (const macro of [cleaner, finder]) {
      expect(macro).toContain("$$installerPid");
      expect(macro).toContain("$$_.ProcessId -ne $$installerPid");
      expect(macro).not.toContain("return $$value.IndexOf($$installFull");
    }
  });

  it("future uninstallers remove Miko-owned install surfaces without atomic old-install staging", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const macro = extractMacro(source, "customRemoveFiles");

    expect(macro).toContain("mikoRemoveOwnedInstallTrees");
    expect(macro).toContain('Delete "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"');
    expect(macro).not.toContain("old-install");
    expect(macro).not.toContain("un.atomicRMDir");
  });

  it("removes legacy Miko-branded install entries without blind global shortcut deletion", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const macro = extractMacro(source, "mikoRemoveOwnedInstallTrees");
    const overlay = extractMacro(source, "mikoPrepareOwnedOverlay");
    const shortcutCleaner = extractMacro(source, "mikoWriteLegacyShortcutCleaner");

    expect(macro).toContain('Delete "$INSTDIR\\Miko.exe"');
    expect(macro).toContain('Delete "$INSTDIR\\Uninstall Miko.exe"');
    expect(macro).toContain('Delete "$INSTDIR\\miko-install-diagnostics.log"');
    expect(macro).not.toContain('Delete "$DESKTOP\\Miko.lnk"');
    expect(macro).not.toContain('Delete "$SMPROGRAMS\\Miko.lnk"');
    expect(macro).not.toContain('RMDir /r "$SMPROGRAMS\\Miko"');
    expect(macro).toContain("mikoRemoveLegacyGlobalShortcuts");
    expect(shortcutCleaner).toContain("WScript.Shell");
    expect(shortcutCleaner).toContain("CreateShortcut");
    expect(shortcutCleaner).toContain("Test-MikoInstallPath $$shortcut.TargetPath");
    expect(shortcutCleaner).toContain("Test-MikoInstallPath $$shortcut.WorkingDirectory");
    expect(shortcutCleaner).not.toContain("Remove-Item -LiteralPath $$legacyDir -Recurse");
    expect(macro).not.toContain('Delete "$INSTDIR\\*.exe"');
    expect(overlay).toContain("mikoRemoveOwnedInstallTrees");
  });

  it("overrides app-running detection to close Miko, legacy Miko, and the bundled server explicitly", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const macro = extractMacro(source, "customCheckAppRunning");

    expect(macro).toContain("Miko.exe");
    expect(macro).toContain("Miko.exe");
    expect(macro).toContain("miko-server.exe");
    expect(macro).toContain("appCannotBeClosed");
    expect(macro).toContain("MB_RETRYCANCEL");
    expect(macro).toContain("DetailPrint");
    expect(macro).not.toContain("StartsWith('$INSTDIR'");
  });

  it("keeps silent updater installs eligible to relaunch after install", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));

    expect(pkg.build.nsis.runAfterFinish).not.toBe(false);
  });

  it("keeps Windows installs on a stable managed install root", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));

    expect(pkg.build.nsis.allowToChangeInstallationDirectory).toBe(false);
  });

  it("pins the Windows executable name to the current product identity", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf-8"));

    expect(pkg.build.win.executableName).toBe("Miko");
    expect(pkg.build.nsis.shortcutName).toBe("Miko");
  });

  it("runs an install surface self-check and writes diagnostics before aborting", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const customInstall = extractMacro(source, "customInstall");
    const verify = extractMacro(source, "mikoVerifyInstallSurface");

    expect(customInstall).toContain("mikoVerifyInstallSurface");
    expect(verify).toContain('miko-install-diagnostics.log');
    expect(verify).toContain('$INSTDIR\\${APP_EXECUTABLE_FILENAME}');
    expect(verify).toContain('$INSTDIR\\resources\\app.asar');
    expect(verify).toContain('$INSTDIR\\resources\\app-update.yml');
    expect(verify).toContain('mikoRequireInstallSurfaceGlob "$INSTDIR\\resources\\seed" "seed-train-*.json"');
    expect(verify).toContain('mikoRequireInstallSurfaceGlob "$INSTDIR\\resources\\seed" "seed-train-*.json.sig"');
    expect(verify).toContain('mikoRequireInstallSurfaceGlob "$INSTDIR\\resources\\seed" "server-*.tar.gz"');
    expect(verify).toContain('mikoRequireInstallSurfaceGlob "$INSTDIR\\resources\\seed" "renderer-*.tar.gz"');
    expect(verify).toContain('$INSTDIR\\resources\\git\\cmd\\git.exe');
    expect(verify).toContain('$INSTDIR\\resources\\git\\usr\\bin\\sh.exe');
    expect(verify).toContain('MessageBox MB_OK|MB_ICONSTOP');
    expect(verify).toContain('Quit');
  });

  it("resolves seed archive wildcards through FindFirst/FindClose without hardcoding a version", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const glob = extractMacro(source, "mikoRequireInstallSurfaceGlob");

    expect(glob).toContain("FindFirst $R3 $R4");
    expect(glob).toContain("FindClose $R3");
    expect(glob).not.toMatch(/\d+\.\d+\.\d+/);
  });

  it("verifies the MinGit install surface without requiring the retired bundled bash", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const verify = extractMacro(source, "mikoVerifyInstallSurface");

    
    expect(verify).not.toContain("bash.exe");
    expect(verify).not.toContain("PortableGit");
  });

  it("records installer phase timing without changing install success conditions", () => {
    const source = fs.readFileSync(path.join(root, "build", "installer.nsh"), "utf-8");
    const timing = extractMacro(source, "mikoInstallTimingMark");
    const persist = extractMacro(source, "mikoPersistInstallTiming");
    const customInit = extractMacro(source, "customInit");
    const customCheck = extractMacro(source, "customCheckAppRunning");
    const customInstall = extractMacro(source, "customInstall");
    const stopProcesses = extractMacro(source, "mikoStopInstallDirProcesses");
    const removeTrees = extractMacro(source, "mikoRemoveOwnedInstallTrees");
    const verify = extractMacro(source, "mikoVerifyInstallSurface");

    expect(timing).toContain("GetTickCount");
    expect(timing).toContain("$PLUGINSDIR\\miko-install-timing.log");
    expect(timing).toContain("phase=${_PHASE}");
    expect(timing).not.toContain("Quit");
    expect(persist).toContain("$INSTDIR\\miko-install-timing.log");
    expect(customInit).toContain('mikoInstallTimingMark "customInit" "start"');
    expect(customInit).toContain('mikoInstallTimingMark "customInit" "end"');
    expect(customCheck).toContain('mikoInstallTimingMark "customCheckAppRunning" "start"');
    expect(customCheck).toContain('mikoInstallTimingMark "customCheckAppRunning" "end"');
    expect(customInstall).toContain('mikoInstallTimingMark "customInstall" "start"');
    expect(customInstall).toContain('mikoInstallTimingMark "customInstall" "end"');
    expect(stopProcesses).toContain('mikoInstallTimingMark "stopInstallDirProcesses" "start"');
    expect(stopProcesses).toContain('mikoInstallTimingMark "stopInstallDirProcesses" "end"');
    expect(removeTrees).toContain('mikoInstallTimingMark "removeOwnedInstallTrees" "start"');
    expect(removeTrees).toContain('mikoInstallTimingMark "removeOwnedInstallTrees" "end"');
    expect(verify).toContain("mikoPersistInstallTiming");
  });
});
