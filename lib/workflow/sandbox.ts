import vm from "node:vm";
import { extractMeta } from "./meta.ts";
import { WORKFLOW_RUNTIME_CONTRACT } from "./host-api.ts";

const DEFAULT_DEADLINE_MS = 5 * 60 * 1000;


export async function runWorkflowScript(script, hostApi, opts: { signal?: AbortSignal, deadlineMs?: number } = {}) {
  const { meta, body } = extractMeta(script);
  const { signal, deadlineMs = DEFAULT_DEADLINE_MS } = opts;
  if (signal?.aborted) throw new Error("This feature is available in English only.");

  
  const sandbox = Object.create(null);
  for (const key of Object.keys(hostApi || {})) sandbox[key] = hostApi[key];
  
  
  sandbox.__wf_api = hostApi || {};
  const context = vm.createContext(sandbox);

  
  const wrapped =
    "(async () => {\n" +
    "'use strict';\n" +
    "This feature is available in English only." +
    "Math.random = __nd; Date.now = __nd;\n" +
    body +
    "\n})()";

  let scriptPromise;
  try {
    scriptPromise = vm.runInContext(wrapped, context, {
      filename: `workflow:${meta.name}`,
      timeout: deadlineMs, 
    });
  } catch (err) {
    throw new Error("This feature is available in English only.");
  }

  const result = await raceDeadline(scriptPromise, { signal, deadlineMs, name: meta.name });
  hostApi?.[WORKFLOW_RUNTIME_CONTRACT]?.assertNoUnawaitedAgentCalls?.();
  return { meta, result };
}


function raceDeadline(promise, { signal, deadlineMs, name }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn(v);
    };
    const timer = setTimeout(() => finish(reject, new Error("This feature is available in English only.")), deadlineMs);
    const onAbort = () => finish(reject, new Error("This feature is available in English only."));
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    promise.then((v) => finish(resolve, v), (e) => finish(reject, e));
  });
}
