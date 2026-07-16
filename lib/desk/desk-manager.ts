

import fs from "fs";
import path from "path";


export function createDeskManager(deskDir) {
  const runsDir = path.join(deskDir, "cron-runs");

  return {
    
    deskDir,

    
    ensureDir() {
      fs.mkdirSync(deskDir, { recursive: true });
      fs.mkdirSync(runsDir, { recursive: true });
    },
  };
}
