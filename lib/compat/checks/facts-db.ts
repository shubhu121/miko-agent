

import fs from "fs";
import path from "path";
import { t } from "../../i18n.ts";
import { createModuleLogger } from "../../debug-log.ts";

const moduleLog = createModuleLogger("compat");

export async function checkFactsDb({ agentDir, log }) {
  const dbPath = path.join(agentDir, "memory", "facts.db");
  if (!fs.existsSync(dbPath)) return; 

  let Database;
  try {
    Database = (await import("better-sqlite3")).default;
  } catch {
    return; 
  }

  try {
    const db = new Database(dbPath, { readonly: true });
    
    db.prepare("SELECT COUNT(*) FROM facts").get();
    db.close();
  } catch (err) {
    
    const backupPath = dbPath + `.bak-${Date.now()}`;
    try {
      fs.renameSync(dbPath, backupPath);
      
      for (const ext of ["-wal", "-shm"]) {
        const walPath = dbPath + ext;
        if (fs.existsSync(walPath)) {
          fs.renameSync(walPath, backupPath + ext);
        }
      }
    } catch {}

    const corruptMsg = "This feature is available in English only.";
    if (log) log(`  [compat] ${corruptMsg}`); else moduleLog.log(corruptMsg);
    return { fixed: true, message: t("error.compatFactsCorrupted") };
  }
}
