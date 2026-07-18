
(function () {
  if (window.miko) {
    
    window.platform = window.miko;
    return;
  }

  
  const params = new URLSearchParams(location.search);
  const devWeb = normalizeDevWebConfig(window.__MIKO_DEV_WEB__);
  const token = params.get("token") || localStorage.getItem("miko-token") || "";
  const baseUrl = devWeb.apiBaseUrl || `${location.protocol}//${location.host}`;
  const serverPort = devWeb.serverPort || safePortFromBaseUrl(baseUrl) || location.port || "3000";

  function normalizeDevWebConfig(value) {
    if (!value || typeof value !== "object") {
      return { serverPort: "", apiBaseUrl: "" };
    }
    const serverPort = typeof value.serverPort === "number" || typeof value.serverPort === "string"
      ? String(value.serverPort).trim()
      : "";
    const apiBaseUrl = typeof value.apiBaseUrl === "string"
      ? value.apiBaseUrl.replace(/\/+$/, "")
      : "";
    return { serverPort, apiBaseUrl };
  }

  function safePortFromBaseUrl(value) {
    try {
      return new URL(value).port;
    } catch {
      return "";
    }
  }

  function apiFetch(path, opts = {}) {
    const headers = { ...opts.headers };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    return fetch(`${baseUrl}${path}`, { ...opts, headers });
  }

  window.platform = {
    
    getServerPort: async () => serverPort,
    getServerToken: async () => token,
    appReady: async () => {},
    syncWindowTheme: () => {},
    runEditCommand: async () => false,

    
    readFile: (p) => apiFetch(`/api/fs/read?path=${encodeURIComponent(p)}`).then(r => r.ok ? r.text() : null),
    readFileSnapshot: async () => null,
    readFileBase64: (p) => apiFetch(`/api/fs/read-base64?path=${encodeURIComponent(p)}`).then(r => r.ok ? r.text() : null),
    readDocxHtml: (p) => apiFetch(`/api/fs/docx-html?path=${encodeURIComponent(p)}`).then(r => r.ok ? r.text() : null),
    readXlsxHtml: (p) => apiFetch(`/api/fs/xlsx-html?path=${encodeURIComponent(p)}`).then(r => r.ok ? r.text() : null),

    
    writeFile: async () => false,
    writeFileBinary: async () => false,
    copyFile: async () => false,
    writeFileIfUnchanged: async () => ({ ok: false }),
    watchFile: async () => false,
    unwatchFile: async () => false,
    onFileChanged: () => {},
    watchWorkspace: async () => false,
    unwatchWorkspace: async () => false,
    onWorkspaceChanged: () => {},
    spawnViewer: async () => null,
    viewerRequestLoad: async () => null,
    viewerClose: () => {},
    onViewerClosed: () => {},

    
    getFilePath: () => null,
    getAvatarPath: () => null,
    getSplashInfo: async () => ({}),

    
    selectFolder: async () => null,
    selectFiles: async () => [],
    selectSkill: async () => null,
    selectPlugin: async () => null,

    
    openFolder: () => {},
    openFile: () => {},
    openExternal: (url) => { try { window.open(url, "_blank"); } catch {} },
    showInFinder: () => {},
    startDrag: () => {},

    
    openSettings: () => {},
    reloadMainWindow: () => location.reload(),

    
    settingsChanged: () => {},
    onSettingsChanged: () => {},
    onOpenSettingsModal: () => {},

    
    openBrowserViewer: () => {},
    closeBrowserViewer: () => {},
    onBrowserUpdate: () => {},
    browserGoBack: () => {},
    browserGoForward: () => {},
    browserReload: () => {},
    browserNewTab: () => {},
    browserSwitchTab: () => {},
    browserCloseTab: () => {},
    browserEmergencyStop: () => {},

    
    openSkillViewer: () => {},
    listSkillFiles: async () => [],
    readSkillFile: async () => null,
    onSkillViewerLoad: () => {},
    closeSkillViewer: () => {},

    // Onboarding
    onboardingComplete: async () => {},
    debugOpenOnboarding: async () => {},
    debugOpenOnboardingPreview: async () => {},

    
    getPlatform: async () => "web",
    windowMinimize: () => {},
    windowMaximize: () => {},
    windowClose: () => {},
    windowIsMaximized: async () => false,
    onMaximizeChange: () => {},
  };
})();


(async function initPlatform() {
  const p = window.platform;
  if (!p?.getPlatform) return;
  const plat = await p.getPlatform();
  document.documentElement.setAttribute("data-platform", plat);
  if (plat === "win32") {
    const scrollIdleTimers = new WeakMap();
    document.addEventListener("scroll", (event) => {
      if (document.documentElement.getAttribute("data-platform") !== "win32") return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      target.classList.add("miko-scroll-active");
      const previousTimer = scrollIdleTimers.get(target);
      if (previousTimer) clearTimeout(previousTimer);
      const nextTimer = setTimeout(() => {
        target.classList.remove("miko-scroll-active");
        scrollIdleTimers.delete(target);
      }, 800);
      scrollIdleTimers.set(target, nextTimer);
    }, { capture: true, passive: true });
  }
  
})();
