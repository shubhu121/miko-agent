

import { debugLog, createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("cron");
export const DEFAULT_CRON_EXECUTION_TIMEOUT_MS = 20 * 60 * 1000;

function normalizeExecutionTimeoutMs(value) {
  if (value === undefined) return DEFAULT_CRON_EXECUTION_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("executionTimeoutMs must be a positive finite number");
  }
  return value;
}

function formatTimeoutMs(ms) {
  if (ms % 60_000 === 0) return `${ms / 60_000}min`;
  if (ms % 1000 === 0) return `${ms / 1000}s`;
  return `${ms}ms`;
}


export function createCronScheduler({ cronStore, executeJob, abortJob, onJobDone, executionTimeoutMs }) {
  const CHECK_INTERVAL = 60_000; 
  const effectiveExecutionTimeoutMs = normalizeExecutionTimeoutMs(executionTimeoutMs);
  let _timer = null;
  let _checking = false;
  let _checkPromise = null;

  
  async function checkJobs() {
    if (_checking) return;
    _checking = true;
    const p = _doCheck();
    _checkPromise = p;
    await p;
  }

  async function _doCheck() {
    try {
      const now = Date.now();
      const jobs = cronStore.listJobs();

      for (const job of jobs) {
        if (!job.enabled) continue;
        if (!job.nextRunAt) continue;

        const nextRunTime = new Date(job.nextRunAt).getTime();
        if (now < nextRunTime) continue;

        
        log.log("This feature is available in English only.");
        debugLog()?.log("cron", `run ${job.id} (${job.label})`);
        const startedAt = new Date().toISOString();

        try {
          let executionResult;
          {
            let timer;
            try {
              executionResult = await Promise.race([
                executeJob(job),
                new Promise((_, reject) => {
                  timer = setTimeout(() => {
                    abortJob?.(job.id);
                    reject(new Error(`execution timeout (${formatTimeoutMs(effectiveExecutionTimeoutMs)})`));
                  }, effectiveExecutionTimeoutMs);
                }),
              ]);
            } finally {
              clearTimeout(timer);
            }
          }
          const finishedAt = new Date().toISOString();

          
          cronStore.logRun(job.id, {
            status: "success",
            startedAt,
            finishedAt,
            ...(executionResult && typeof executionResult === "object" && !Array.isArray(executionResult)
              ? executionResult
              : {}),
          });
          cronStore.markRun(job.id, { success: true });
          debugLog()?.log("cron", `job success ${job.id}`);

          onJobDone?.(job, {
            status: "success",
            ...(executionResult && typeof executionResult === "object" && !Array.isArray(executionResult)
              ? executionResult
              : {}),
          });
        } catch (err) {
          const finishedAt = new Date().toISOString();

          if (err.skipped) {
            
            cronStore.logRun(job.id, { status: "skipped", startedAt, finishedAt });
            debugLog()?.log("cron", `job skipped ${job.id}: ${err.message}`);
            onJobDone?.(job, { status: "skipped" });
          } else {
            
            cronStore.logRun(job.id, { status: "error", startedAt, finishedAt, error: err.message });
            cronStore.markRun(job.id, { success: false });

            log.error("This feature is available in English only.");
            debugLog()?.error("cron", `job failed ${job.id}: ${err.message}`);
            onJobDone?.(job, { status: "error", error: err.message });
          }
        }
      }
    } catch (err) {
      log.error("This feature is available in English only.");
      debugLog()?.error("cron", `checkJobs error: ${err.message}`);
    } finally {
      _checking = false;
    }
  }

  function start() {
    if (_timer) return;
    _timer = setInterval(() => checkJobs(), CHECK_INTERVAL);
    
    log.log("This feature is available in English only.");
  }

  async function stop() {
    if (_timer) {
      clearInterval(_timer);
      _timer = null;
    }
    if (_checkPromise) {
      await _checkPromise.catch(() => {});
      _checkPromise = null;
    }
  }

  return { start, stop, checkJobs };
}
