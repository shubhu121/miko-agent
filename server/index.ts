
import crypto from "crypto";
import fs from "fs";
import { setMaxListeners } from "events";
import path from "path";
import { Hono } from "hono";
import { createAdaptorServer } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { WebSocketServer } from "ws";
import { AppError } from "../shared/errors.ts";
import { errorBus } from "../shared/error-bus.ts";
import { MikoEngine } from "../core/engine.ts";
import { ensureFirstRun } from "../core/first-run.ts";
import { initDebugLog, createModuleLogger } from "../lib/debug-log.ts";
import { redactLogLabel, redactLogText } from "../lib/log-redactor.ts";
import { safeJson } from "./hono-helpers.ts";
import { resolveSessionThinkingLevelState } from "./session-thinking-level-state.ts";

const log = createModuleLogger("server");
const checkpointLog = createModuleLogger("checkpoint");
const sessionFilesLog = createModuleLogger("session-files");
import { createOutboundProxyRuntime } from "../lib/net/outbound-proxy.ts";
import { createServerAuthService } from "../core/server-auth.ts";
import { createWebSocketTicketService } from "../core/ws-auth-ticket.ts";
import { resolveServerListenOptions, saveServerNetworkConfig } from "../core/server-network-config.ts";
import {
  decideLoopbackBindFallback,
  ensureServerNetworkConfigWithPortSelection,
  isMikoServerListeningOnPort,
  selectLoopbackListenPort,
} from "../core/server-port-selection.ts";
import { isCorsOriginAllowed } from "./http/cors-policy.ts";
import { inferHttpConnectionKind } from "./http/transport-context.ts";
import { authorizeHttpRoute, isPublicHttpRoute } from "./http/route-security.ts";


setMaxListeners(50);

import { loadLocale } from "../lib/i18n.ts";
import { verifyPluginIframeTicketForHostRequest } from "./routes/plugins.ts";
import { PluginIframeTicketError } from "../core/plugin-iframe-ticket-service.ts";
import { PluginAssetSessionError } from "../core/plugin-asset-session-service.ts";
import {
  isMalformedPluginAssetRequest,
  isPluginAssetRequest,
  verifyPluginAssetSessionForHostRequest,
} from "./http/plugin-assets.ts";
import { resolveHttpRequestPrincipal } from "./http/request-principal.ts";
import { ensureLocalIdentityRegistries } from "../core/server-identity.ts";
import { createMobileWorkbenchRoute } from "./routes/mobile-workbench.ts";
import { registerOpenRoutes } from "./composition/open-root.ts";
import type { CompositionRoot, CompositionContext } from "./composition/contract.ts";
import { registerTaskRegistryBusHandlers } from "./task-bus-handlers.ts";
import { registerDeferredResultBusHandlers } from "./deferred-result-bus-handlers.ts";
import { resolveMikoHome } from "../shared/miko-runtime-paths.ts";
import { DATA_EPOCH } from "../shared/contract-versions.cjs";
import { readDataEpochStamp } from "../shared/data-epoch.cjs";
import { describeForeignServerBlock, isForeignServerBlocking, probeServerInfo } from "../shared/server-info-probe.cjs";
import { coordinateDataEpochStartup, describeDataEpochStartupBlock } from "../core/data-epoch-coordinator.ts";
import { createDataEpochCheckpointProvider } from "../core/data-epoch-checkpoint-provider.ts";
// internal-browser WS is handled directly via raw ws.WebSocketServer in the
// upgrade handler below (WsTransport needs raw ws .on()/.off() methods)





import { BrowserManager } from "../lib/browser/browser-manager.ts";
import { ConfirmStore } from "../lib/confirm-store.ts";
import { DeferredResultStore } from "../lib/deferred-result-store.ts";
import { SubagentRunStore } from "../lib/subagent-run-store.ts";
import { SubagentThreadStore } from "../lib/subagent-thread-store.ts";
import { ActivityHub } from "../lib/activity-hub.ts";
import { WorkflowActivityStore } from "../lib/workflow-activity-store.ts";
import { createDeferredResultExtension } from "../lib/extensions/deferred-result-ext.ts";
import { createCompactionGuardExtension } from "../lib/extensions/compaction-guard-ext.ts";
import { getResolvedCompactionMode } from "../shared/compaction-mode.ts";
import { Hub } from "../hub/index.ts";
import { startCLI } from "./cli.ts";
import { fromRoot } from "../shared/miko-root.ts";
import { callText } from "../core/llm-client.ts";
import { callTextConfigFromUtilityConfig } from "../core/model-execution-config.ts";

const productDir = fromRoot("lib");

const BIND_FALLBACK_CANDIDATE_CODES = new Set(["EADDRINUSE", "EACCES", "EPERM"]);


export async function startServer(root: CompositionRoot = {}): Promise<void> {
  function attemptListen(server: any, port: number, host: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        server.off("listening", onListening);
        server.off("error", onError);
      };
      const onListening = () => {
        cleanup();
        resolve();
      };
      const onError = (err: any) => {
        cleanup();
        reject(err);
      };
      server.once("listening", onListening);
      server.once("error", onError);
      server.listen(port, host);
    });
  }

  function failStartup(startupError: any): never {
    if (startupError.startupPayload) {
      log.error(`startup-error ${JSON.stringify(startupError.startupPayload)}`);
    }
    log.error("This feature is available in English only.");
    process.exit(1);
  }

  async function bindServerTransportOwnership(
    server: any,
    { host, port, listenHost, networkMode, config, envPortPinned }: any,
  ): Promise<{ boundPort: number }> {
    try {
      await attemptListen(server, port, host);
      return { boundPort: port };
    } catch (err: any) {
      const errCode = err?.code;
      
      
      const fallbackEligible =
        BIND_FALLBACK_CANDIDATE_CODES.has(errCode) && networkMode === "loopback" && !envPortPinned;
      const mikoOnPort = fallbackEligible ? await isMikoServerListeningOnPort({ port, host }) : false;
      const decision = decideLoopbackBindFallback({ errCode, networkMode, envPortPinned, mikoOnPort });

      if (decision === "fallback") {
        const fallbackPort = await selectLoopbackListenPort({ host, exclude: [port] });
        if (fallbackPort !== null) {
          try {
            await attemptListen(server, fallbackPort, host);
            log.warn(
              "This feature is available in English only.",
            );
            saveServerNetworkConfig(mikoHome, { ...config, listenPort: fallbackPort });
            return { boundPort: fallbackPort };
          } catch {
            
          }
        }
      }

      if (decision === "fail-other-miko") {
        const startupError: any = createPortInUseStartupError(err, { host, port, listenHost, networkMode });
        startupError.startupPayload.suggestions.unshift(
          "Another Miko server is already listening on this port. If you have a second Miko installation or data directory, give each one a distinct port; if this is a leftover process, quit the server from Task Manager.",
        );
        failStartup(startupError);
      }

      const startupError: any = isAddressInUseError(err)
        ? createPortInUseStartupError(err, { host, port, listenHost, networkMode })
        : isListenPermissionError(err)
        ? createListenPermissionStartupError(err, { host, port, listenHost, networkMode })
        : err;
      failStartup(startupError);
    }
  }

  function isAddressInUseError(err: any) {
    return err?.code === "EADDRINUSE";
  }

  function isListenPermissionError(err: any) {
    return err?.code === "EACCES" || err?.code === "EPERM";
  }

  function createPortInUseStartupError(cause: any, { host, port, listenHost, networkMode }: any) {
    const payload = {
      code: "PORT_IN_USE",
      host,
      port,
      listenHost,
      networkMode,
      suggestions: [
        `Close the process already listening on ${host}:${port}.`,
        "If this is another Miko server, restart that instance or quit it cleanly.",
        "To use a different port, change the port in Access & Devices and restart.",
      ],
    };
    const err: any = new Error(
      `PORT_IN_USE: ${host}:${port} is already in use (network mode: ${networkMode}, configured host: ${listenHost}).`
    );
    err.code = "PORT_IN_USE";
    err.startupPayload = payload;
    err.cause = cause;
    return err;
  }

  function createListenPermissionStartupError(cause: any, { host, port, listenHost, networkMode }: any) {
    const payload = {
      code: "LISTEN_PERMISSION_DENIED",
      host,
      port,
      listenHost,
      networkMode,
      suggestions: [
        `Check whether Windows reserved port policy or security software blocks listening on ${host}:${port}.`,
        "Use loopback mode for local-only access, or enable LAN from Access & Devices and restart.",
        "To use a different port, change the port in Access & Devices and restart.",
      ],
    };
    const err: any = new Error(
      `LISTEN_PERMISSION_DENIED: ${host}:${port} cannot be listened on (network mode: ${networkMode}, configured host: ${listenHost}).`
    );
    err.code = "LISTEN_PERMISSION_DENIED";
    err.startupPayload = payload;
    err.cause = cause;
    return err;
  }

  
  
  const mikoHome = resolveMikoHome(process.env.MIKO_HOME);
  process.env.MIKO_HOME = mikoHome;

  
  let appVersion = "?";
  try {
    const pkg = JSON.parse(fs.readFileSync(fromRoot("package.json"), "utf-8"));
    appVersion = pkg.version || "?";
  } catch {}

  
  
  
  
  
  
  
  
  
  
  
  {
    const serverInfoPath = path.join(mikoHome, "server-info.json");
    let existingServerInfo: any = null;
    try {
      existingServerInfo = JSON.parse(fs.readFileSync(serverInfoPath, "utf-8"));
    } catch {
      
    }

    if (existingServerInfo) {
      const probe = await probeServerInfo({ info: existingServerInfo });
      if (isForeignServerBlocking(probe.status)) {
        console.error(describeForeignServerBlock({ status: probe.status, info: existingServerInfo }));
        process.exit(1);
      }
      
      try { fs.unlinkSync(serverInfoPath); } catch {}
    }
  }

  
  
  
  
  {
    const allowDataDowngrade = process.env.MIKO_ALLOW_DATA_DOWNGRADE === "1";
    const epochResult = await coordinateDataEpochStartup({
      homeDir: mikoHome,
      ownEpoch: DATA_EPOCH,
      ownVersion: appVersion,
      allowDowngrade: allowDataDowngrade,
      log: { warn: (msg: string) => console.warn(msg) },
      // DATA_EPOCH is pinned at 1, so production never actually runs a
      // transition today — this injection only makes sure the checkpoint
      // provider is wired in, rather than absent, the day DATA_EPOCH first
      // bumps (an absent provider fails closed with
      // "checkpoint-provider-unavailable"; this makes that dead branch live).
      checkpointProvider: createDataEpochCheckpointProvider(),
    });
    if (epochResult.allowed === false) {
      // DATA_EPOCH=1 is still the compatibility baseline: production has
      // no epoch migration path yet. At this stage, damaged/orphaned epoch
      // metadata is diagnostic evidence, not proof that the user's stores
      // have changed format. Refusing the whole application on that weak
      // signal makes the future safety mechanism itself a present-day
      // availability hazard.
      //
      // Keep blocking when there is concrete evidence of newer-format
      // data: a readable higher stamp or a readable transition targeting a
      // higher epoch. Once this build itself advances beyond epoch 1, every
      // coordinator failure is strict again.
      const stampRead = readDataEpochStamp(mikoHome);
      const hasHigherStamp = stampRead.status === "ok"
        && stampRead.stamp.minimumReaderEpoch > DATA_EPOCH;
      const hasHigherTransition = Number.isInteger(epochResult.toEpoch)
        && epochResult.toEpoch! > DATA_EPOCH;
      const mustBlock = DATA_EPOCH > 1 || hasHigherStamp || hasHigherTransition;
      if (!mustBlock) {
        console.warn(
          `MIKO_DATA_EPOCH_BASELINE_WARNING reason=${epochResult.reason}\n`
          + `[data-epoch] epoch=1 baseline metadata could not be trusted (${epochResult.detail}); `
          + "no higher-epoch evidence was found, so ordinary startup will continue.",
        );
      } else {
        
        
        
        
        const marker = epochResult.reason === "epoch-downgrade-blocked"
          ? "MIKO_DATA_EPOCH_BLOCKED"
          : "MIKO_DATA_EPOCH_TRANSITION_INCOMPLETE";
        console.error(`${marker} reason=${epochResult.reason}`);
        console.error(describeDataEpochStartupBlock(epochResult));
        process.exit(1);
      }
    }
  }

  const SERVER_TOKEN = process.env.MIKO_TOKEN || crypto.randomBytes(16).toString("hex");
  const envPort = Number.parseInt(process.env.MIKO_PORT || "", 10);
  const envPortPinned = Number.isInteger(envPort) && envPort >= 0;
  if (!envPortPinned) {
    await ensureServerNetworkConfigWithPortSelection(mikoHome, { log: (msg) => log.log(msg) });
  }
  const serverNetwork = resolveServerListenOptions(mikoHome);
  const port = envPortPinned ? envPort : serverNetwork.port;
  const serverRuntimeState = {
    mode: serverNetwork.mode,
    listenHost: serverNetwork.host,
    bindHost: serverNetwork.host,
    configuredMode: serverNetwork.mode,
    configuredListenHost: serverNetwork.host,
    configuredPort: port,
    actualPort: null,
    applyNetworkConfig(network) {
      this.configuredMode = network.mode;
      this.configuredListenHost = network.listenHost;
      this.configuredPort = network.listenPort;
    },
  };
  const host = serverRuntimeState.bindHost;

  function createServerRuntimeNetworkSummary() {
    return {
      mode: serverRuntimeState.mode,
      listenHost: serverRuntimeState.listenHost,
      bindHost: serverRuntimeState.bindHost,
      actualPort: Number.isInteger(serverRuntimeState.actualPort) ? serverRuntimeState.actualPort : null,
      configuredMode: serverRuntimeState.configuredMode || serverRuntimeState.mode,
      configuredListenHost: serverRuntimeState.configuredListenHost || serverRuntimeState.listenHost,
      configuredPort: Number.isInteger(serverRuntimeState.configuredPort) ? serverRuntimeState.configuredPort : port,
    };
  }

  let activeFetch: any = (request: any) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/health") {
      return Response.json({
        status: "starting",
        version: appVersion,
        networkMode: serverRuntimeState.mode,
        configuredHost: serverRuntimeState.listenHost,
        network: createServerRuntimeNetworkSummary(),
      }, { status: 503 });
    }
    return Response.json({ error: "server_starting" }, { status: 503 });
  };

  let server: any = createAdaptorServer({
    fetch: (...args: any[]) => activeFetch(...args),
    hostname: host,
  });

  const bindResult = await bindServerTransportOwnership(server, {
    host,
    port,
    listenHost: serverNetwork.host,
    networkMode: serverNetwork.mode,
    config: serverNetwork.config,
    envPortPinned,
  });
  serverRuntimeState.configuredPort = bindResult.boundPort;

  
  log.log("① ensureFirstRun...");
  const firstRunReport = ensureFirstRun(mikoHome, productDir);
  for (const invalid of firstRunReport.invalidAgentDirs) {
    log.warn("This feature is available in English only.");
  }
  if (firstRunReport.defaultConfigBackupPath) {
    log.warn("This feature is available in English only.");
  }
  log.log("This feature is available in English only.");

  log.log("① ensureLocalIdentityRegistries...");
  ensureLocalIdentityRegistries(mikoHome);
  log.log("This feature is available in English only.");

  
  const dlog = initDebugLog(path.join(mikoHome, "logs"));

  
  log.log("This feature is available in English only.");
  const engine: any = new MikoEngine({
    mikoHome,
    productDir,
    appVersion,
    builtinMediaAdapters: root.builtinMediaAdapters,
  } as any);
  log.log("This feature is available in English only.");
  await engine.init((msg: any) => log.log(msg));
  log.log("This feature is available in English only.");
  dlog.log("server", "engine initialized");

  const outboundProxyRuntime = createOutboundProxyRuntime({
    log: (msg: any) => dlog.log("server", msg),
    warn: (msg: any) => log.warn(msg),
  } as any);
  engine.setOutboundProxyRuntime(outboundProxyRuntime);
  outboundProxyRuntime.apply(engine.getNetworkProxy());

  
  BrowserManager.setMikoHome(engine.mikoHome);
  BrowserManager.setSessionIdResolver((sessionPath: string) => engine.getSessionIdForPath?.(sessionPath) || null);

  
  
  
  
  

  
  dlog.header(appVersion, {
    model: engine.currentModel?.name || "(none)",
    agent: engine.agentName,
    agentId: engine.currentAgentId, // @ui-focus-ok: startup log
    utilityModel: (() => { try { return engine.resolveUtilityConfig?.()?.utility?.id || "(none)"; } catch { return "(none)"; } })(),
    channelsDir: engine.channelsDir,
  });

  if (process.platform === "win32") engine.startWin32LegacySandboxMaintenance();

  
  const hub = new Hub({ engine });

  // Framework Pi SDK extensions must be registered before plugin onStartup
  // lifecycles can create or resume sessions through session:send.
  const deferredResultStore = new DeferredResultStore(
    hub.eventBus,
    path.join(mikoHome, ".ephemeral", "deferred-tasks.json"),
    { getSessionIdForPath: (sessionPath: string) => engine.getSessionIdForPath?.(sessionPath) || null },
  );
  engine.setDeferredResultStore(deferredResultStore);
  registerDeferredResultBusHandlers(hub.eventBus, deferredResultStore);

  await engine.registerExtensionFactory(createDeferredResultExtension(deferredResultStore));
  await engine.registerExtensionFactory(createCompactionGuardExtension({
    usageLedger: engine.usageLedger,
    getCompactionMode: () => getResolvedCompactionMode(engine.preferences),
    buildSessionCacheSnapshot: (sessionPath, options) => engine.buildSessionCacheSnapshot(sessionPath, options),
    buildUsageContext: ({ ctx }) => {
      const sessionPath = ctx?.sessionManager?.getSessionFile?.() || null;
      const bridgeContext = sessionPath ? engine.getBridgeContextForSessionPath(sessionPath) : null;
      if (bridgeContext?.isBridgeSession) {
        const conversationType = bridgeContext.chatType === "channel" ? "channel" : "dm";
        return {
          source: {
            subsystem: "compaction",
            operation: "fresh_compact",
            surface: conversationType,
            trigger: "threshold",
          },
          attribution: {
            kind: "phone_conversation",
            agentId: bridgeContext.agentId || null,
            conversationId: bridgeContext.sessionKey || bridgeContext.chatId || sessionPath,
            conversationType,
            ...sessionUsageFields(sessionPath),
          },
        };
      }
      return {
        source: {
          subsystem: "compaction",
          operation: "compact",
          surface: "desktop",
          trigger: "threshold",
        },
        attribution: sessionUsageAttribution(
          sessionPath,
          sessionPath ? engine.resolveSessionOwnership?.(sessionPath)?.agentId || null : null,
        ),
      };
    },
  }));

  
  await engine.initPlugins(hub.eventBus);

  
  hub.initSchedulers();

  engine.cleanupCheckpoints().catch(err => {
    checkpointLog.warn(`startup cleanup failed: ${err.message}`);
  });

  engine.cleanupColdSessionFiles().catch(err => {
    sessionFilesLog.warn(`startup cleanup failed: ${err.message}`);
  });
  const sessionFileCleanupTimer = setInterval(() => {
    engine.cleanupColdSessionFiles().catch(err => {
      sessionFilesLog.warn(`periodic cleanup failed: ${err.message}`);
    });
  }, 24 * 60 * 60 * 1000);
  sessionFileCleanupTimer.unref?.();

  
  loadLocale(engine.getLocale?.() || engine.config?.locale);

  const serverAuthService = createServerAuthService({
    mikoHome,
    loopbackToken: SERVER_TOKEN,
    runtimeContext: () => engine.getRuntimeContext(),
  });
  const wsTicketService = createWebSocketTicketService();

  
  const app = new Hono();
  const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

  
  const corsAllowedOrigin = process.env.MIKO_CORS_ORIGIN;
  app.use("*", async (c: any, next: any) => {
    const origin = c.req.header("origin") || "";
    const isAllowed = isCorsOriginAllowed({
      origin,
      configuredOrigin: corsAllowedOrigin,
    } as any);
    if (origin && isAllowed) {
      c.header("Access-Control-Allow-Origin", origin);
      c.header("Access-Control-Allow-Credentials", "true");
    }
    c.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (c.req.method === "OPTIONS") return c.text("", 204);

    const transport = inferHttpConnectionKind({
      hostHeader: c.req.header("host"),
      remoteAddress: (c.env as any)?.incoming?.socket?.remoteAddress,
      networkMode: serverRuntimeState.mode,
    } as any);
    if (!transport.connectionKind) {
      return c.json({ error: "invalid_transport", detail: transport.reason }, 403);
    }
    const routePath = new URL(c.req.url).pathname;
    c.set("transportConnectionKind", transport.connectionKind);

    if (isResourceTicketContentRequest(c, routePath)) {
      await next();
      return;
    }

    if (isPluginIframeTicketRequest(c, routePath)) {
      try {
        verifyPluginIframeTicketForHostRequest(c, engine, { requireTicket: true });
      } catch (err: any) {
        if (err instanceof PluginIframeTicketError) {
          return c.json({ error: (err as any).code, detail: err.message }, (err as any).status);
        }
        throw err;
      }
      await next();
      return;
    }

    if (isMalformedPluginAssetRequest(c.req.url, routePath)) {
      return c.json({ error: "plugin_asset_not_found" }, 404);
    }

    if (isPluginAssetSessionRequest(c, routePath)) {
      try {
        const session = verifyPluginAssetSessionForHostRequest(c, engine, { requireSession: false });
        if (session) {
          await next();
          return;
        }
      } catch (err: any) {
        if (err instanceof PluginAssetSessionError) {
          return c.json({ error: (err as any).code, detail: err.message }, (err as any).status);
        }
        throw err;
      }
    }

    if (isPublicHttpRoute({ method: c.req.method, path: routePath })) {
      await next();
      return;
    }

    
    
    const resolved = resolveHttpRequestPrincipal(c, engine, {
      serverAuthService,
      wsTicketService,
      connectionKind: transport.connectionKind,
    });
    if (!resolved.ok) {
      return c.json(resolved.body, resolved.status);
    }
    c.set("authPrincipal", resolved.principal);

    await next();
  });

  function isResourceTicketContentRequest(c: any, routePath: any) {
    const method = c.req.method;
    return (method === "GET" || method === "HEAD")
      && /^\/api\/resources\/[^/]+\/content$/.test(routePath)
      && !!c.req.query("ticket");
  }

  function isPluginIframeTicketRequest(c: any, routePath: any) {
    const method = c.req.method;
    return (method === "GET" || method === "HEAD")
      && /^\/api\/plugins\/[^/]+\/.+$/.test(routePath)
      && !!c.req.query("pluginIframeTicket");
  }

  function isPluginAssetSessionRequest(c: any, routePath: any) {
    const method = c.req.method;
    return (method === "GET" || method === "HEAD")
      && isPluginAssetRequest(routePath);
  }

  
  app.onError((err: any, c: any) => {
    const appErr = AppError.wrap(err);
    errorBus.report(appErr, {
      context: { method: c.req.method, url: c.req.url },
    });
    return c.json(
      { error: { code: appErr.code, message: appErr.message, traceId: appErr.traceId } },
      appErr.httpStatus
    );
  });

  
  const confirmStore = new ConfirmStore({
    getSessionIdForPath: (sessionPath: string) => engine.getSessionIdForPath?.(sessionPath) || null,
  });
  engine.setConfirmStore(confirmStore);

  const subagentRunStore = new SubagentRunStore(
    path.join(mikoHome, "subagent-runs.json"),
    { getSessionIdForPath: (sessionPath: string) => engine.getSessionIdForPath?.(sessionPath) || null },
  );
  engine.setSubagentRunStore(subagentRunStore);

  const subagentThreadStore = new SubagentThreadStore(
    path.join(mikoHome, "subagent-threads.json"),
    { getSessionIdForPath: (sessionPath: string) => engine.getSessionIdForPath?.(sessionPath) || null },
  );
  engine.setSubagentThreadStore(subagentThreadStore);

  
  
  
  
  const WORKFLOW_ACTIVITY_TTL_MS = 72 * 60 * 60 * 1000;
  const workflowActivityStore = new WorkflowActivityStore(
    path.join(mikoHome, "workflow-activity.json"),
  );
  workflowActivityStore.prune(WORKFLOW_ACTIVITY_TTL_MS, Date.now());
  const activityHub = new ActivityHub(
    { emit: (event, sp) => engine.emitEvent(event, sp) },
    workflowActivityStore,
    { getSessionIdForPath: (sessionPath: string) => engine.getSessionIdForPath?.(sessionPath) || null },
  );
  engine.setActivityHub(activityHub);

  // Task registry bus handlers (plugin access)
  registerTaskRegistryBusHandlers(hub.eventBus, engine.taskRegistry);
  hub.eventBus.handle("session:get-titles", async ({ paths }) => {
    if (!Array.isArray(paths) || !paths.length) return { titles: {} };
    const coord = engine._sessionCoord;
    if (!coord?.getTitlesForPaths) return { titles: {} };
    const titles = await coord.getTitlesForPaths(paths);
    return { titles };
  });
  function sessionUsageFields(sessionPath: string | null) {
    const cleanSessionPath = typeof sessionPath === "string" && sessionPath.trim()
      ? sessionPath.trim()
      : null;
    const sessionId = cleanSessionPath
      ? engine.getSessionIdForPath?.(cleanSessionPath) || null
      : null;
    return {
      ...(sessionId ? { sessionId } : {}),
      ...(cleanSessionPath ? { sessionPath: cleanSessionPath } : {}),
    };
  }

  function sessionUsageAttribution(sessionPath: string | null, agentId: string | null, extra: Record<string, any> = {}) {
    return {
      kind: "session",
      agentId: agentId || null,
      ...sessionUsageFields(sessionPath),
      ...extra,
    };
  }

  hub.eventBus.handle("utility:call-text", async (payload: any = {}) => {
    const sessionPath = typeof payload.sessionPath === "string" && payload.sessionPath.trim()
      ? payload.sessionPath.trim()
      : null;
    const agentId = typeof payload.agentId === "string" && payload.agentId.trim()
      ? payload.agentId.trim()
      : (sessionPath ? engine.resolveSessionOwnership?.(sessionPath)?.agentId || null : null);
    const utility = await engine.resolveUtilityConfigFresh({ agentId, sessionPath });
    const text = await callText({
      ...callTextConfigFromUtilityConfig(utility),
      systemPrompt: payload.systemPrompt || "",
      messages: Array.isArray(payload.messages) ? payload.messages : [],
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
      usageLedger: utility.usageLedger,
      usageContext: {
        source: {
          subsystem: "utility",
          operation: payload.operation || "call-text",
          surface: sessionPath ? "desktop" : "system",
          trigger: "tool",
        },
        attribution: sessionPath
          ? sessionUsageAttribution(sessionPath, utility.usageAgentId || agentId || null)
          : { kind: "utility", agentId: utility.usageAgentId || agentId || null },
      },
    } as any);
    return { text };
  });
  hub.eventBus.handle("model:sample-text", async (payload: any = {}) => {
    if (!Array.isArray(payload.messages)) {
      throw new Error("messages is required");
    }
    const sessionPath = typeof payload.sessionPath === "string" && payload.sessionPath.trim()
      ? payload.sessionPath.trim()
      : null;
    const agentId = typeof payload.agentId === "string" && payload.agentId.trim()
      ? payload.agentId.trim()
      : (sessionPath ? engine.resolveSessionOwnership?.(sessionPath)?.agentId || null : null);
    const pluginId = typeof payload.pluginId === "string" && payload.pluginId.trim()
      ? payload.pluginId.trim()
      : null;
    const utility = await engine.resolveUtilityConfigFresh({ agentId, sessionPath });
    const text = await callText({
      ...callTextConfigFromUtilityConfig(utility),
      systemPrompt: payload.systemPrompt || "",
      messages: payload.messages,
      temperature: payload.temperature,
      maxTokens: payload.maxTokens,
      usageLedger: utility.usageLedger,
      usageContext: {
        source: {
          subsystem: pluginId ? "plugin" : "utility",
          operation: payload.operation || "sample-text",
          surface: "plugin",
          trigger: "tool",
          actor: pluginId ? { kind: "plugin", pluginId, agentId: agentId || null, ...sessionUsageFields(sessionPath) } : undefined,
        },
        attribution: pluginId
          ? { kind: "plugin", pluginId, agentId: utility.usageAgentId || agentId || null, ...sessionUsageFields(sessionPath) }
          : sessionPath
            ? sessionUsageAttribution(sessionPath, utility.usageAgentId || agentId || null)
            : { kind: "utility", agentId: utility.usageAgentId || agentId || null },
      },
    } as any);
    return { text };
  });
  hub.eventBus.handle("usage:list", (filter = {}) => {
    return engine.usageLedger.list(filter);
  });

  
  
  
  
  
  
  const shouldCreateStartupSession = process.env.MIKO_CREATE_STARTUP_SESSION !== "0";
  if (shouldCreateStartupSession && engine.currentModel) {
    log.log("This feature is available in English only.");
    await engine.createSession();
    log.log("③ Session created");
    dlog.log("server", `session created, model=${engine.currentModel.name}`);
  } else if (!shouldCreateStartupSession) {
    log.log("This feature is available in English only.");
    dlog.log("server", "startup session creation skipped");
  } else {
    
    const availableCount = engine.availableModels?.length ?? 0;
    const chatRef = engine.agent?.config?.models?.chat;
    const chatRefStr = typeof chatRef === "object" ? JSON.stringify(chatRef) : (chatRef || "(empty)");
    let reason;
    if (availableCount === 0) {
      reason = "available models list is empty (no provider has valid api_key + models)";
    } else if (!chatRef) {
      reason = `agent.config.models.chat is empty, but ${availableCount} models are available`;
    } else {
      reason = `models.chat=${chatRefStr} not found in ${availableCount} available models`;
    }
    log.warn("This feature is available in English only.");
    dlog.warn("server", `session creation skipped: ${reason}`);
  }

  
  let bridgeManager = null;
  let bridgeManagerInitPromise = null;
  let bridgeManagerInitError = null;
  let bridgeAutoStartRequested = false;
  let bridgeAutoStartDone = false;

  function runBridgeAutoStart(manager: any) {
    if (!manager || bridgeAutoStartDone) return;
    bridgeAutoStartDone = true;
    manager.autoStart(engine.agents);
    dlog.log("server", "bridge autoStart done");
  }

  async function startBridgeManager({ autoStart = false } = {}) {
    if (autoStart) bridgeAutoStartRequested = true;
    if (bridgeManager) {
      if (autoStart) runBridgeAutoStart(bridgeManager);
      return bridgeManager;
    }
    if (bridgeManagerInitPromise) return bridgeManagerInitPromise;

    bridgeManagerInitError = null;
    bridgeManagerInitPromise = (async () => {
      log.log("This feature is available in English only.");
      const { BridgeManager } = await import("../lib/bridge/bridge-manager.ts");
      const manager = new BridgeManager({ engine, hub });
      bridgeManager = manager;
      hub.bridgeManager = manager;
      if (bridgeAutoStartRequested) runBridgeAutoStart(manager);
      log.log("This feature is available in English only.");
      return manager;
    })().catch((err) => {
      bridgeManagerInitError = err;
      hub.bridgeManager = null;
      log.error("This feature is available in English only.");
      dlog.error("server", `bridge init failed: ${err.stack || err.message}`);
      return null;
    }).finally(() => {
      bridgeManagerInitPromise = null;
    });

    return bridgeManagerInitPromise;
  }

  const bridgeManagerRef = {
    get: () => bridgeManager,
    ensureReady: () => startBridgeManager(),
    getState: () => ({
      ready: !!bridgeManager,
      initializing: !!bridgeManagerInitPromise,
      error: bridgeManagerInitError?.message || null,
    }),
  };

  
  
  

  
  
  
  
  
  
  
  const ctx: CompositionContext = {
    engine,
    hub,
    upgradeWebSocket,
    wsTicketService,
    serverAuthService,
    serverRuntimeState,
    bridgeManagerRef,
    confirmStore,
    appVersion,
  };
  registerOpenRoutes(app, ctx);
  app.route("/api", createMobileWorkbenchRoute(engine));
  root.registerClosedRoutes?.(app, ctx);
  // internal-browser WS — see unified upgrade handler in server startup below

  
  app.get("/api/health", async (c) => {
    
    const avatars = {};
    for (const role of ['agent', 'user']) {
      const dir = path.join(role === 'user' ? engine.userDir : engine.agentDir, 'avatars');
      avatars[role] = false;
      try {
        const files = fs.readdirSync(dir);
        avatars[role] = files.some(f => /\.(png|jpe?g|webp)$/i.test(f));
      } catch {}
    }
    return c.json({
      status: "ok",
      version: appVersion,
      agentId: engine.currentAgentId || null,
      agent: engine.agentName,
      agentYuan: engine.agent?.config?.agent?.yuan || "miko",
      user: engine.userName,
      model: engine.currentModel?.name,
      avatars,
      network: createServerRuntimeNetworkSummary(),
    });
  });

  activeFetch = app.fetch.bind(app);

  
  app.post("/api/log", async (c) => {
    const { level, module, message } = await safeJson(c);
    if (!message) return c.json({ ok: false });
    const safeModule = redactLogLabel(module || "desktop");
    const safeMessage = redactLogText(message);
    if (level === "error") dlog.error(safeModule, safeMessage);
    else if (level === "warn") dlog.warn(safeModule, safeMessage);
    else dlog.log(safeModule, safeMessage);
    return c.json({ ok: true });
  });

  
  app.get("/api/plan-mode", async (c) => {
    return c.json({
      enabled: engine.planMode,
      mode: engine.permissionMode,
      accessMode: engine.accessMode,
      locked: false,
    });
  });
  app.post("/api/plan-mode", async (c) => {
    const { enabled, mode } = await safeJson(c);
    const result = mode ? engine.setSessionPermissionMode(mode) : engine.setPlanMode(!!enabled);
    return c.json({
      ok: result?.ok !== false,
      locked: false,
      enabled: engine.planMode,
      mode: engine.permissionMode,
      accessMode: engine.accessMode,
    });
  });

  app.get("/api/session-permission-mode", async (c) => {
    return c.json({
      mode: engine.permissionMode,
      accessMode: engine.accessMode,
      defaultMode: engine.getSessionPermissionModeDefault(),
    });
  });

  app.get("/api/session-thinking-level", async (c) => {
    const sessionPath = c.req.query("sessionPath") || null;
    const pendingNewSession = c.req.query("pendingNewSession") === "1";
    return c.json(resolveSessionThinkingLevelState(engine, { sessionPath, pendingNewSession }));
  });

  app.post("/api/session-thinking-level", async (c) => {
    const { sessionPath, level } = await safeJson(c);
    const result = sessionPath
      ? await engine.setSessionThinkingLevel(sessionPath, level)
      : await engine.setDefaultThinkingLevel(level);
    if (result?.ok === false) {
      return c.json({
        ok: false,
        error: result.error || "failed to set thinking level",
        ...resolveSessionThinkingLevelState(engine, { sessionPath, pendingNewSession: !sessionPath }),
      }, 409);
    }
    return c.json({
      ok: true,
      ...resolveSessionThinkingLevelState(engine, { sessionPath, pendingNewSession: !sessionPath }),
    });
  });

  app.post("/api/session-permission-mode", async (c) => {
    const { mode, pendingNewSession, currentSessionOnly, sessionPath } = await safeJson(c);
    const targetSessionPath = typeof sessionPath === "string" && sessionPath ? sessionPath : null;
    const result = currentSessionOnly === true
      ? engine.setCurrentSessionPermissionMode(mode)
      : pendingNewSession === true
      ? engine.setPendingSessionPermissionMode(mode)
      : targetSessionPath
      ? engine.setSessionPermissionModeForSession(targetSessionPath, mode)
      : engine.setSessionPermissionMode(mode);
    const explicitSession = currentSessionOnly === true || !!targetSessionPath;
    if (explicitSession && result?.ok === false) {
      return c.json({
        ok: false,
        error: result.error || "session permission mode requires an active session",
        mode: result.mode,
        accessMode: result.mode === "read_only" ? "read_only" : "operate",
        defaultMode: engine.getSessionPermissionModeDefault(),
      }, 409);
    }
    const scopedMode = pendingNewSession === true || explicitSession;
    return c.json({
      ok: result?.ok !== false,
      mode: scopedMode ? result?.mode : engine.permissionMode,
      accessMode: scopedMode
        ? (result?.mode === "read_only" ? "read_only" : "operate")
        : engine.accessMode,
      defaultMode: engine.getSessionPermissionModeDefault(),
    });
  });

  
  app.post("/api/shutdown", async (c) => {
    log.log("This feature is available in English only.");
    
    setTimeout(() => gracefulShutdown(), 100);
    return c.json({ ok: true });
  });

  
  try {
    // ── Internal browser control WS (raw ws) ──
    // WsTransport requires raw ws .on()/.off() event methods that Hono's WSContext
    // doesn't expose, so we handle /internal/browser via a standalone WebSocketServer.
    //
    // To avoid both handlers firing on the same upgrade request (which would corrupt
    // the socket), we pass injectWebSocket a proxy that filters out /internal/browser
    // upgrades before they reach Hono's handler.
    const browserWss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      if (url.pathname !== "/internal/browser") return; // let Hono handle it

      const transport = inferHttpConnectionKind({
        hostHeader: req.headers.host,
        remoteAddress: req.socket?.remoteAddress,
        networkMode: serverRuntimeState.mode,
      } as any);
      if (!transport.connectionKind) {
        socket.destroy();
        return;
      }

      const authPrincipal = serverAuthService.authenticateRequest({
        authorization: req.headers.authorization,
        queryToken: url.searchParams.get("token"),
        allowQueryToken: true,
        connectionKind: transport.connectionKind,
      });
      const authz = authPrincipal
        ? authorizeHttpRoute({ method: "GET", path: url.pathname, principal: authPrincipal })
        : null;
      if (!authPrincipal || !authz?.allowed) {
        socket.destroy();
        return;
      }
      browserWss.handleUpgrade(req, socket, head, (ws) => {
        browserWss.emit("connection", ws, req);
      });
    });

    browserWss.on("connection", (ws) => {
      const bm = BrowserManager.instance();
      bm.setWsTransport(ws);

      
      const _bwsEnabled = process.env.MIKO_DEBUG === "1";
      let _bwsBuf = "";
      let _bwsFlushTimer = null;
      const _bwsLogPath = path.join(mikoHome, "browser-ws.log");
      let _bwsFlushChain = Promise.resolve();
      const _bwsFlush = () => {
        if (!_bwsBuf) return;
        const chunk = _bwsBuf;
        _bwsBuf = "";
        _bwsFlushTimer = null;
        _bwsFlushChain = _bwsFlushChain.then(() =>
          fs.promises.appendFile(_bwsLogPath, chunk)
        ).catch(() => {});
      };
      const _bwsLog = (line: any) => {
        if (!_bwsEnabled) return;
        _bwsBuf += `${new Date().toISOString()} ${line}\n`;
        if (!_bwsFlushTimer) _bwsFlushTimer = setTimeout(_bwsFlush, 500);
      };
      _bwsLog("browser WS connected");
      const origSend = ws.send.bind(ws);
      ws.send = function(data: any, ...args: any[]) {
        try { const m = JSON.parse(data); _bwsLog(`→ cmd=${m.cmd || m.type} id=${m.id || "?"}`); } catch {}
        return origSend(data, ...args);
      };
      ws.on("message", (data) => {
        try { const m = JSON.parse(data); _bwsLog(`← type=${m.type} id=${m.id || "?"} error=${m.error || "none"}`); } catch {}
      });

      ws.on("close", () => {
        if (bm._transport?._ws === ws) bm.setWsTransport(null);
        log.log("Electron browser control WS disconnected");
      });
      ws.on("error", (err) => {
        log.error(`Electron browser control WS error: ${err.message}`);
        if (bm._transport?._ws === ws) bm.setWsTransport(null);
      });
      log.log("Electron browser control WS connected");
    });

    // Inject Hono WS for chat and other WS routes, but skip /internal/browser
    // to prevent double-handling the same upgrade request
    injectWebSocket({
      on(event: any, handler: any) {
        if (event === "upgrade") {
          server.on("upgrade", (req: any, socket: any, head: any) => {
            const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
            if (url.pathname === "/internal/browser") return; // already handled above
            handler(req, socket, head);
          });
        } else {
          server.on(event, handler);
        }
      },
    } as any);

    const address: any = server.address();
    const actualPort = address.port;
    serverRuntimeState.actualPort = actualPort;

    log.log(`Miko Server running at http://${host}:${actualPort}`);
    dlog.log("server", `listening on :${actualPort}`);

    
    
    
    
    const serverInfoPath = path.join(mikoHome, "server-info.json");
    try {
      const runtimeContext = engine.getRuntimeContext?.() || {};
      fs.writeFileSync(serverInfoPath, JSON.stringify({
        pid: process.pid,
        port: actualPort,
        host,
        configuredHost: serverRuntimeState.listenHost,
        networkMode: serverRuntimeState.mode,
        configuredMode: serverRuntimeState.configuredMode,
        configuredListenHost: serverRuntimeState.configuredListenHost,
        configuredPort: serverRuntimeState.configuredPort,
        network: createServerRuntimeNetworkSummary(),
        token: SERVER_TOKEN,
        version: appVersion,
        ownerKind: process.env.MIKO_SERVER_OWNER === "desktop" ? "desktop" : "standalone",
        ownerPid: Number.parseInt(process.env.MIKO_SERVER_OWNER_PID || "", 10) || null,
        serverId: runtimeContext.serverId || null,
        serverNodeId: runtimeContext.serverNodeId || runtimeContext.serverId || null,
        studioId: runtimeContext.studioId || null,
        userId: runtimeContext.userId || null,
      }), { mode: 0o600 });
      
      try { fs.chmodSync(serverInfoPath, 0o600); } catch {}
    } catch (e) {
      log.error("This feature is available in English only.");
    }

    
    log.log(`ready: port=${actualPort}`);

    
    
    
    startBridgeManager({ autoStart: true });

    // Legacy explicit attach mode. Normal headless server runs stay quiet.
    if (process.stdin.isTTY && (process.argv.includes("--cli") || process.argv.includes("--chat"))) {
      startCLI({
        port: actualPort,
        token: SERVER_TOKEN,
        agentName: engine.agentName,
        userName: engine.userName,
      });
    }

  } catch (err) {
    log.error("This feature is available in English only.");
    process.exit(1);
  }

  
  let _shutting = false;
  async function gracefulShutdown() {
    if (_shutting) return;
    _shutting = true;
    log.log("This feature is available in English only.");
    dlog.log("server", "shutting down...");

    
    const forceTimer = setTimeout(() => {
      log.error("This feature is available in English only.");
      process.exit(1);
    }, 15000);
    forceTimer.unref();

    try {
      
      server.close();
      log.log("This feature is available in English only.");
      dlog.log("server", "HTTP server closed");

      
      try {
        const { BrowserManager } = await import("../lib/browser/browser-manager.ts");
        const bm = BrowserManager.instance();
        for (const sp of bm.runningSessions) {
          await bm.suspendForSession(sp);
          log.log("This feature is available in English only.");
        }
      } catch (e) {
        log.error("This feature is available in English only.");
      }

      
      bridgeManager?.stopAll();
      dlog.log("server", "bridge stopped");

      
      engine.deferredResults?.dispose?.();

      
      await hub.dispose();
      log.log("This feature is available in English only.");
      dlog.log("server", "hub + engine disposed");
    } catch (err) {
      log.error("This feature is available in English only.");
      dlog.error("server", `shutdown error: ${err.message}`);
    }

    clearTimeout(forceTimer);
    try { fs.unlinkSync(path.join(mikoHome, "server-info.json")); } catch {}
    process.exit(0);
  }

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
  if (process.platform === "win32") process.on("SIGBREAK", gracefulShutdown);

  
  let _stdoutBroken = false;
  function _safeConsoleError(...args) {
    if (_stdoutBroken) return;
    try {
      console.error(...args);
    } catch {
      _stdoutBroken = true;
    }
  }

  process.on("uncaughtException", (err: any) => {
    if (err?.code === "EPIPE" || err?.code === "ERR_IPC_CHANNEL_CLOSED") {
      if (!_stdoutBroken) {
        _stdoutBroken = true;
        dlog.error("server", `stdout pipe broken (${err.code}), suppressing further console output`);
      }
      return;
    }
    dlog.error("server", `uncaughtException: ${err.message}`);
    _safeConsoleError("[server] uncaughtException:", err);
  });
  process.on("unhandledRejection", (reason) => {
    dlog.error("server", `unhandledRejection: ${reason}`);
    _safeConsoleError("[server] unhandledRejection:", reason);
  });
}
