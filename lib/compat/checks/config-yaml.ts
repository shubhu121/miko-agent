

import fs from "fs";
import path from "path";
import { t } from "../../i18n.ts";

export function checkConfigYaml({ agentDir, mikoHome }) {
  const configPath = path.join(agentDir, "config.yaml");
  if (!fs.existsSync(configPath)) return;

  try {
    const content = fs.readFileSync(configPath, "utf-8");
    
    
    if (!content.trim()) throw new Error(t("error.compatConfigEmpty"));
    if (!content.includes(":")) throw new Error(t("error.compatConfigInvalid"));
  } catch (err) {
    const backupPath = configPath + `.bak-${Date.now()}`;
    try {
      fs.renameSync(configPath, backupPath);
    } catch {}

    
    const templateCandidates = [
      path.join(path.dirname(path.dirname(agentDir)), "..", "lib", "config.example.yaml"),
    ];
    for (const tpl of templateCandidates) {
      try {
        if (fs.existsSync(tpl)) {
          fs.copyFileSync(tpl, configPath);
          return { fixed: true, message: t("error.compatConfigCorrupted", { msg: err.message }) };
        }
      } catch {}
    }

    return { fixed: true, message: t("error.compatConfigBackedUp", { msg: err.message, backup: path.basename(backupPath) }) };
  }
}
