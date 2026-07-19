
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const MAIN_PATH = path.join(process.cwd(), "desktop", "main.cjs");
const PRELOAD_PATH = path.join(process.cwd(), "desktop", "preload.cjs");

function readSource(filePath: string): string {
  // Windows CI checks out with CRLF; contract tests match LF-shaped snippets.
  return fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
}

function sliceFrom(source: string, marker: string, length: number): string {
  const idx = source.indexOf(marker);
  expect(idx).toBeGreaterThan(-1);
  return source.slice(idx, idx + length);
}

describe("viewer window load contract (main process)", () => {
  it("never sends viewer-load on did-finish-load (push contract is banned)", () => {
    const source = readSource(MAIN_PATH);
    
    expect(source).not.toContain('webContents.send("viewer-load"');
    expect(source).not.toContain("webContents.send('viewer-load'");
  });

  it("exposes viewer-request-load as a strict (error-propagating) handler", () => {
    const source = readSource(MAIN_PATH);
    expect(source).toContain('wrapIpcHandler("viewer-request-load"');
  });

  it("stores payloads in a windowId-keyed map alongside _viewerWindows", () => {
    const source = readSource(MAIN_PATH);
    expect(source).toContain("const _viewerPayloads = new Map()");

    const spawnBody = sliceFrom(source, 'wrapIpcBestEffortHandler("spawn-viewer"', 2000);
    expect(spawnBody).toContain("_viewerPayloads.set(windowId, data)");
    
    expect(spawnBody).toContain("_viewerPayloads.delete(windowId)");
  });

  it("clears all viewer payloads when the main window is destroyed", () => {
    const source = readSource(MAIN_PATH);
    expect(source).toContain("_viewerWindows.clear();\n    _viewerPayloads.clear();");
  });

  it("viewer-request-load resolves the payload for the requesting window's own id", () => {
    const source = readSource(MAIN_PATH);
    const handlerSlice = sliceFrom(source, 'wrapIpcHandler("viewer-request-load"', 500);
    expect(handlerSlice).toContain("BrowserWindow.fromWebContents(event.sender)");
    expect(handlerSlice).toContain("_viewerPayloads.get(win.id)");
    expect(handlerSlice).toContain("return { ...data, windowId: win.id }");
  });

  it("preload no longer exposes onViewerLoad and instead exposes viewerRequestLoad", () => {
    const source = readSource(PRELOAD_PATH);
    expect(source).not.toContain("onViewerLoad");
    expect(source).not.toContain('ipcRenderer.on("viewer-load"');
    expect(source).toContain('viewerRequestLoad: () => ipcRenderer.invoke("viewer-request-load")');
  });
});
