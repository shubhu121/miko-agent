
import fs from "fs";
import path from "path";
import { YUAN_VISUALS } from "../shared/yuan-visuals.ts";


export function copySplashAssets({ srcDir, outDir }) {
  const copied = { platformJs: false, locales: [], avatars: [] };

  const platformJsSrc = path.join(srcDir, "modules", "platform.js");
  const platformJsDest = path.join(outDir, "modules", "platform.js");
  fs.mkdirSync(path.dirname(platformJsDest), { recursive: true });
  fs.copyFileSync(platformJsSrc, platformJsDest);
  copied.platformJs = true;

  const localesSrcDir = path.join(srcDir, "locales");
  const localesDestDir = path.join(outDir, "locales");
  fs.mkdirSync(localesDestDir, { recursive: true });
  for (const entry of fs.readdirSync(localesSrcDir)) {
    if (!entry.endsWith(".json")) continue;
    fs.copyFileSync(path.join(localesSrcDir, entry), path.join(localesDestDir, entry));
    copied.locales.push(entry);
  }

  const assetsSrcDir = path.join(srcDir, "assets");
  const assetsDestDir = path.join(outDir, "assets");
  fs.mkdirSync(assetsDestDir, { recursive: true });
  for (const visual of Object.values(YUAN_VISUALS)) {
    fs.copyFileSync(path.join(assetsSrcDir, visual.avatar), path.join(assetsDestDir, visual.avatar));
    copied.avatars.push(visual.avatar);
  }

  return copied;
}
