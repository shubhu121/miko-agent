

import {
  buildDeferredResultMessage,
  isUiOnlyDeferredResultTask,
  shouldNotifyAgentOnFailure,
} from "../deferred-result-notification.ts";
import { createModuleLogger } from "../debug-log.ts";

const log = createModuleLogger("deferred-result-ext");

function isExternallyDeliveredTask(task) {
  return task?.meta?.deliveryTarget?.kind === "bridge";
}


function tryDeliver(pi, store, taskId, task) {
  try {
    pi.sendMessage(
      buildDeferredResultMessage(taskId, task),
      { deliverAs: "steer", triggerTurn: true },
    );
    store.markDelivered(taskId);
    return true;
  } catch (err) {
    log.error(`steer failed for ${taskId}: ${err.message || err} ${err.stack?.split('\n').slice(0, 3).join('\n') || ''}`);
    return false;
  }
}

/**
 * @param {import("../deferred-result-store.ts").DeferredResultStore} deferredStore
 * @returns {(pi: object) => void}
 */
export function createDeferredResultExtension(deferredStore) {
  return function (pi) {
    let sessionPath = null;

    pi.on("session_start", (event, ctx) => {
      sessionPath = ctx.sessionManager.getSessionFile();

      
      setTimeout(() => {
        const undelivered = deferredStore.listUndelivered(sessionPath);
        for (const task of undelivered) {
          if (isUiOnlyDeferredResultTask(task) && !shouldNotifyAgentOnFailure(task)) continue;
          if (isExternallyDeliveredTask(task)) continue;
          tryDeliver(pi, deferredStore, task.taskId, task);
        }

        
        const pending = deferredStore.listPending(sessionPath);
        if (pending.length) {
          try {
            pi.sendMessage(
              {
                customType: "miko-deferred-task-reminder",
                content: "This feature is available in English only.",
                display: false,
              },
              { deliverAs: "steer", triggerTurn: false },
            );
          } catch { /* best effort */ }
        }
      }, 500);
    });

    pi.on("session_shutdown", () => {
      sessionPath = null;
    });
  };
}
