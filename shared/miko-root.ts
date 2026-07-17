
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));


export const MIKO_ROOT = process.env.MIKO_ROOT || path.resolve(__dirname, "..");


export function fromRoot(...segments) {
  return path.join(MIKO_ROOT, ...segments);
}
