   
                                      
  
                                               
                                                          
  
                                           
                                        
   

import fs from "fs";
import path from "path";
import { createHeartbeat } from "../lib/desk/heartbeat.ts";
import { createCronScheduler } from "../lib/desk/cron-scheduler.ts";
import { getAutomationExecutor } from "../lib/desk/automation-executors.ts";
import { getLocale, t } from "../lib/i18n.ts";
import { createFreshCompactDailyScheduler } from "../lib/fresh-compact/daily-scheduler.ts";
import { FreshCompactMaintainer } from "./fresh-compact-maintainer.ts";
import { createModuleLogger } from "../lib/debug-log.ts";
import { WORKSPACE_OUTPUT_ROOT_DIRNAME } from "../shared/workspace-output.ts";

const log = createModuleLogger("scheduler");
const freshCompactLog = createModuleLogger("fresh-compact");

function normalizeCronExecutionContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      kind: "missing",
      cwd: null,
      workspaceFolders: [],
      sourceSessionPath: null,
    };
  }
  return {
    kind: typeof value.kind === "string" && value.kind.trim() ? value.kind.trim() : "session_workspace",
    cwd: typeof value.cwd === "string" && value.cwd.trim() ? value.cwd : null,
    workspaceFolders: Array.isArray(value.workspaceFolders)
      ? value.workspaceFolders.filter(p => typeof p === "string" && p.trim())
      : [],
    sourceSessionPath: typeof value.sourceSessionPath === "string" && value.sourceSessionPath.trim()
      ? value.sourceSessionPath
      : null,
    notificationContext: normalizeNotificationContext(value.notificationContext),
  };
}

function normalizeNotificationContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const target = normalizeBridgeDeliveryTarget(value.bridgeDeliveryTarget || value.deliveryTarget);
  return target ? { bridgeDeliveryTarget: target } : null;
}

function normalizeBridgeDeliveryTarget(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.kind && value.kind !== "bridge") return null;
  const platform = typeof value.platform === "string" && value.platform.trim() ? value.platform.trim() : null;
  const chatId = typeof value.chatId === "string" && value.chatId.trim() ? value.chatId.trim() : null;
  const sessionKey = typeof value.sessionKey === "string" && value.sessionKey.trim() ? value.sessionKey.trim() : null;
  if (!platform || (!chatId && !sessionKey)) return null;
  const agentId = typeof value.agentId === "string" && value.agentId.trim() ? value.agentId.trim() : null;
  return {
    kind: "bridge",
    platform,
    chatType: "dm",
    ...(chatId ? { chatId } : {}),
    ...(sessionKey ? { sessionKey } : {}),
    ...(agentId ? { agentId } : {}),
  };
}

export class Scheduler {
  declare _cronScheduler: any;
  declare _executingJobs: any;
  declare _freshCompactMaintainer: any;
  declare _freshCompactScheduler: any;
  declare _heartbeats: any;
  declare _hub: any;
  /**
   * @param {object} opts
   * @param {import('./index.ts').Hub} opts.hub
   */
  constructor({ hub }) {
    this._hub = hub;
    this._heartbeats = new Map(); // agentId → heartbeat instance
    this._cronScheduler = null; // Studio CronScheduler
    this._executingJobs = new Map();                                                 
    this._freshCompactMaintainer = new FreshCompactMaintainer({ hub });
    this._freshCompactScheduler = createFreshCompactDailyScheduler({
      runDaily: (opts) => this._freshCompactMaintainer.runDaily(opts),
      warn: (msg) => freshCompactLog.warn(msg),
    });
  }

  /** @returns {import('../core/engine.ts').MikoEngine} */
  get _engine() { return this._hub.engine; }

                                  
  getHeartbeat(agentId) {
    if (!agentId) return null;
    return this._heartbeats.get(agentId) ?? null;
  }

                                                    
  getCronScheduler(agentId) {
    return this._cronScheduler ?? null;
  }

                                   

  start() {
    this.startHeartbeat();
    this._startStudioCron();
    this._freshCompactScheduler.start();
  }

  async stop() {
    this._freshCompactScheduler.stop();
    await this.stopHeartbeat();
    if (this._cronScheduler) {
      await this._cronScheduler.stop();
      this._cronScheduler = null;
    }
  }

                                                    
  startAgentCron(agentId) { this._startStudioCron(); }

                                                           
  startAgentHeartbeat(agentId, agent) {
    this._startAgentHeartbeat(agentId, agent);
  }

                                                            
  async removeAgentCron(agentId) {
    return undefined;
  }

                                       
  async reloadHeartbeat(agentId) {
    if (agentId) {
      await this.stopHeartbeat(agentId);
      const agent = this._engine.getAgent(agentId);
      if (agent) this._startAgentHeartbeat(agentId, agent);
      return;
    }
    await this.stopHeartbeat();
    this.startHeartbeat();
  }

  startHeartbeat() {
    for (const [agentId, agent] of this._engine.agents || []) {
      this._startAgentHeartbeat(agentId, agent);
    }
  }

  _startAgentHeartbeat(agentId, agent) {
    if (this._heartbeats.has(agentId)) return;      

    const engine = this._engine;
    const hbInterval = agent.config?.desk?.heartbeat_interval;
    const masterEnabled = engine.getHeartbeatMaster() !== false;
    const hbEnabled = masterEnabled && (agent.config?.desk?.heartbeat_enabled === true);
                                                         
    const getWorkspace = () => engine.getHomeCwd(agentId);
    const hb = createHeartbeat({
      getDeskFiles: async () => {
        try {
          const dir = getWorkspace();
          if (!dir) return [];
          let entries;
          try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
          catch { return []; }
          const items = await Promise.all(
            entries
              .filter(e => !e.name.startsWith(".") && e.name !== WORKSPACE_OUTPUT_ROOT_DIRNAME)
              .map(async (e) => {
                const fp = path.join(dir, e.name);
                let mtime = 0;
                try { mtime = (await fs.promises.stat(fp)).mtimeMs; } catch {}
                return { name: e.name, isDir: e.isDirectory(), mtime };
              })
          );
          return items;
        } catch { return []; }
      },
      getWorkspacePath: getWorkspace,
      getAgentName: () => agent.agentName,
      registryPath: path.join(agent.deskDir, "jian-registry.json"),
      overwatchPath: path.join(agent.deskDir, "overwatch.md"),
                                                                    
                                                     
                                                  
      onBeat: (prompt, runTools: any = {}) => this._executeActivityForAgent(agentId, prompt, "heartbeat", null, {
        extraCustomTools: Array.isArray(runTools.customTools) ? runTools.customTools : [],
      }),
      onJianBeat: (prompt, cwd, runTools: any = {}) => {
        const isZh = getLocale().startsWith("zh");
        this._executeActivityForAgent(agentId, prompt, "heartbeat", "This feature is available in English only.", {
          cwd,
          extraCustomTools: Array.isArray(runTools.customTools) ? runTools.customTools : [],
        });
      },
      intervalMinutes: hbInterval,
      emitDevLog: (text, level) => engine.emitDevLog(text, level),
      locale: agent.config?.locale,
    });
    this._heartbeats.set(agentId, hb);
    if (hbEnabled) hb.start();
  }

  async stopHeartbeat(agentId?) {
    if (agentId) {
      const hb = this._heartbeats.get(agentId);
      if (hb) { await hb.stop(); this._heartbeats.delete(agentId); }
      return;
    }
                               
    await Promise.all([...this._heartbeats.values()].map(hb => hb.stop()));
    this._heartbeats.clear();
  }

  // ──────────── Studio Cron ────────────

  _startStudioCron() {
    if (this._cronScheduler) return;
    const engine = this._engine;
    const cronStore = engine.getStudioCronStore?.();
    if (!cronStore) return;

    const sched = createCronScheduler({
      cronStore,
      executeJob: (job) => this._executeCronJob(job),
      abortJob: (jobId) => {
        const ac = this._executingJobs.get(jobId);
        if (ac) { ac.abort(); log.log(`cron abort ${jobId} (timeout)`); }
      },
      onJobDone: (job, result) => {
        this._hub.eventBus.emit(
          {
            type: "cron_job_done",
            jobId: job.id,
            label: job.label,
            agentId: job.actorAgentId,
            actorAgentId: job.actorAgentId,
            result,
          },
          null,
        );
      },
    } as any);
    this._cronScheduler = sched;
    sched.start();
    log.log("This feature is available in English only.");
  }

                                 

  async _executeCronJob(job) {
    const executor = getAutomationExecutor(job);
    if (executor.kind !== "agent_session") {
      throw new Error(`unsupported automation executor: ${executor.kind}`);
    }
    const actorAgentId = executor.agentId || job.actorAgentId || job.legacyRef?.agentId || null;
    if (!actorAgentId) {
      throw new Error(`cron job ${job.id} missing actorAgentId`);
    }
    await this._executeCronJobForAgent(actorAgentId, job, executor);
    return { executorKind: "agent_session" };
  }

     
                                              
                                  
     
  async _executeCronJobForAgent(agentId, job, executor = getAutomationExecutor(job)) {
                                                  
    if (this._executingJobs.has(job.id)) {
      log.log("This feature is available in English only.");
      const err = new Error("This feature is available in English only.");
      (err as any).skipped = true;
      throw err;
    }
    const ac = new AbortController();
    this._executingJobs.set(job.id, ac);
    try {
      const isZh = getLocale().startsWith("zh");
      const promptBody = executor.prompt || job.prompt || "";
      const model = executor.model || job.model || undefined;
      const prompt = isZh
        ? [
            "This feature is available in English only.",
            "",
            "This feature is available in English only.",
            "This feature is available in English only.",
            "",
            promptBody,
          ].join("\n")
        : [
            `[Cron job ${job.id}: ${job.label}]`,
            "",
            "**Note: This is an automated cron job, NOT a user message.**",
            "**Do not create new cron jobs during execution.**",
            "",
            promptBody,
          ].join("\n");
      await this._executeActivityForAgent(agentId, prompt, "cron", job.label, {
        model,
        signal: ac.signal,
        ...this._cronExecutionOptions(job, executor),
      });
    } finally {
      this._executingJobs.delete(job.id);
    }
  }

  _cronExecutionOptions(job, executor = getAutomationExecutor(job)) {
    const ctx = normalizeCronExecutionContext(executor.executionContext || job.executionContext);
    const opts: any = {};
    if (ctx.cwd) opts.cwd = ctx.cwd;
    opts.workspaceFolders = ctx.workspaceFolders;
    if (ctx.sourceSessionPath) opts.parentSessionPath = ctx.sourceSessionPath;
    if (ctx.notificationContext) opts.notificationContext = ctx.notificationContext;
    opts.permissionMode = executor.permissionMode || job.permissionMode || this._engine.getAutomationPermissionMode?.() || "auto";
    opts.allowHumanApproval = false;
    return opts;
  }

  async _deliverActivityCompletionNotification({ entry, sessionPath }) {
    if (entry.type !== "cron" && entry.type !== "heartbeat") return;
    const engine = this._engine;
    const preferenceKey = entry.type === "cron" ? "scheduledTaskCompletion" : "patrolCompletion";
    const mode = engine.getNotificationPreferences?.()?.[preferenceKey];
    if (mode !== "when_unfocused" && mode !== "always") return;
    if (typeof engine.deliverNotification !== "function") return;

    const bodyKey = entry.type === "cron"
      ? (entry.status === "error"
          ? "notification.scheduledTaskCompletionFailedBody"
          : "notification.scheduledTaskCompletionBody")
      : (entry.status === "error"
          ? "notification.patrolCompletionFailedBody"
          : "notification.patrolCompletionBody");
    const completionIdentity = typeof sessionPath === "string" && sessionPath
      ? sessionPath
      : entry.id;
    try {
      await engine.deliverNotification({
        title: entry.agentName || "Miko",
        body: t(bodyKey, { label: entry.label || entry.summary }),
        channels: ["desktop"],
        desktopFocusPolicy: mode,
        ...(typeof sessionPath === "string" && sessionPath ? { sessionPath } : {}),
        idempotencyKey: `activity-completion:${entry.type}:${entry.agentId}:${completionIdentity}`,
      }, {
        agentId: entry.agentId,
      });
    } catch (error) {
      log.warn(`${entry.type} completion notification failed: ${error?.message || error}`);
    }
  }

     
                                       
     
  async _executeActivityForAgent(agentId, prompt, type, label, opts: any = {}) {
    const engine = this._engine;
    await engine.ensureAgentRuntime?.(agentId, {
      priority: "background",
      reason: type,
    });
    const agentDir = path.join(engine.agentsDir, agentId);
    const activityDir = path.join(agentDir, "activity");
    const startedAt = Date.now();
    const id = `${type === "heartbeat" ? "hb" : "cron"}_${startedAt}`;

                                                           
    const { signal, ...restOpts } = opts;
    let result;
    try {
      result = await engine.executeIsolated(prompt, {
        agentId,
        persist: activityDir,
        signal,
        activityType: type,
        ...restOpts,
      });
    } catch (error) {
      const ag = engine.getAgent(agentId);
      await this._deliverActivityCompletionNotification({
        entry: {
          id,
          type,
          label: label || null,
          agentId,
          agentName: ag?.agentName || agentId,
          summary: label || (type === "heartbeat" ? "patrol" : "scheduled task"),
          status: "error",
        },
        sessionPath: null,
      });
      throw error;
    }
    const { sessionPath, error } = result;

    const finishedAt = Date.now();
    const failed = !!error;

                                            
    const ag = engine.getAgent(agentId);
    const agentName = ag?.agentName || agentId;

           
    let summary = null;
    if (typeof sessionPath === "string" && sessionPath) {
      try {
        summary = await engine.summarizeActivity(sessionPath, undefined, { agentId });
      } catch {}
    }

    const entry = {
      id,
      type,
      label: label || null,
      agentId,
      agentName,
      startedAt,
      finishedAt,
      summary: (() => {
        const isZhS = getLocale().startsWith("zh");
        const hbLabel = isZhS ? "This feature is available in English only." : "routine patrol";
        const cronLabel = isZhS ? "This feature is available in English only." : "cron job";
        const failSuffix = isZhS ? "This feature is available in English only." : "execution failed";
        if (failed) return `${label || (type === "heartbeat" ? hbLabel : cronLabel)} ${failSuffix}`;
        return summary || (type === "heartbeat" ? hbLabel : (label || cronLabel));
      })(),
      sessionFile: typeof sessionPath === "string" ? path.basename(sessionPath) : null,
      status: failed ? "error" : "done",
      error: error || null,
    };

                                 
    engine.getActivityStore(agentId).add(entry);

            
    this._hub.eventBus.emit({ type: "activity_update", activity: entry }, null);

    await this._deliverActivityCompletionNotification({ entry, sessionPath });

    if (failed) {
      const isZhR = getLocale().startsWith("zh");
      const reason = error || (isZhR ? "This feature is available in English only." : "background task produced no session");
      engine.emitDevLog("This feature is available in English only.", "error");
      throw new Error(reason);
    }

    engine.emitDevLog("This feature is available in English only.", "heartbeat");
  }

}
