
import { pathToFileURL } from "node:url";

let _counter = 0;
export async function freshImport(filePath) {
  const url = pathToFileURL(filePath);
  url.searchParams.set("t", `${Date.now()}-${_counter++}`);
  return import(url.href);
}
