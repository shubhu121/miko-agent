
import fs from "fs";
import path from "path";
import { fromRoot } from "../shared/miko-root.ts";
import { createModuleLogger } from "./debug-log.ts";

const log = createModuleLogger("i18n");

const localesDir = fromRoot("desktop", "src", "locales");

let data = {};

let fallbackData = {};
let currentLocale = "en";
let loaded = false;


function resolveKey(_locale) {
  return "en";
}


function readLocaleFile(key) {
  return JSON.parse(fs.readFileSync(path.join(localesDir, `${key}.json`), "utf-8"));
}

export function loadLocale(locale) {
  const key = resolveKey(locale);
  currentLocale = key;
  loaded = true;
  
  try {
    fallbackData = readLocaleFile("en");
  } catch (err) {
    log.error(`Failed to load fallback locale "en": ${err.message}`);
    fallbackData = {};
  }
  if (key === "en") {
    data = fallbackData;
    return;
  }
  try {
    data = readLocaleFile(key);
  } catch (err) {
    log.error(`Failed to load locale "${key}": ${err.message}`);
    data = fallbackData;
  }
}


function getFrom(source, p) {
  const exact = source?.[p];
  if (exact !== undefined && exact !== null) return exact;
  return p.split(".").reduce((obj, k) => obj?.[k], source);
}

function get(p) {
  if (!loaded) loadLocale(currentLocale);
  const val = getFrom(data, p);
  if (val !== undefined && val !== null) return val;
  return getFrom(fallbackData, p);
}


export function t(path, vars?) {
  let val = get(path);
  if (val === undefined || val === null) return path;
  if (typeof val !== "string") return val;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      val = val.replaceAll(`{${k}}`, String(v));
    }
  }
  return val;
}

export function getLocale() {
  return currentLocale;
}
