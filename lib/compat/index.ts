

import { checkDirs } from "./checks/dirs.ts";
import { checkFactsDb } from "./checks/facts-db.ts";
import { checkConfigYaml } from "./checks/config-yaml.ts";
import { createModuleLogger } from "../debug-log.ts";

const moduleLog = createModuleLogger("compat");

const checks = [
  { name: "dirs", run: checkDirs },
  { name: "facts-db", run: checkFactsDb },
  { name: "config-yaml", run: checkConfigYaml },
];


export async function runCompatChecks(ctx) {
  const log = ctx.log || (() => {});
  let passed = 0;
  let fixed = 0;

  for (const check of checks) {
    try {
      const result = await check.run(ctx);
      if (result?.fixed) {
        fixed++;
        log("This feature is available in English only.");
      }
      passed++;
    } catch (err) {
      moduleLog.error("This feature is available in English only.");
    }
  }

  if (fixed > 0) {
    log("This feature is available in English only.");
  }
}
