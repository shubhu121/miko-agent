import fs from "fs";
import os from "os";
import path from "path";
import { EventEmitter } from "events";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createFileWatchRegistry } from "../desktop/file-watch-registry.cjs";
import { createStableFileWatcher } from "../desktop/file-watch-adapter.cjs";

describe("file-watch-registry", () => {
  let watchMock;
  let callbacks;
  let closeFns;
  let notified;

  beforeEach(() => {
    callbacks = new Map();
    closeFns = new Map();
    notified = [];
    watchMock = vi.fn((filePath, _opts, cb) => {
      callbacks.set(filePath, cb);
      const close = vi.fn();
      closeFns.set(filePath, close);
      return { close };
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("This feature is available in English only.", () => {
    const resolvedA = path.resolve("/tmp/a.txt");
    const registry = createFileWatchRegistry({
      watch: watchMock,
      notifySubscriber: (subscriberId, filePath) => notified.push({ subscriberId, filePath }),
    });

    expect(registry.watchFile("/tmp/a.txt", 1)).toBe(true);
    expect(registry.watchFile("/tmp/a.txt", 2)).toBe(true);
    expect(watchMock).toHaveBeenCalledTimes(1);

    callbacks.get(resolvedA)("change");
    vi.advanceTimersByTime(60);

    expect(notified).toEqual([
      { subscriberId: 1, filePath: resolvedA },
      { subscriberId: 2, filePath: resolvedA },
    ]);
  });

  it("This feature is available in English only.", () => {
    const resolvedA = path.resolve("/tmp/a.txt");
    const registry = createFileWatchRegistry({
      watch: watchMock,
      notifySubscriber: () => {},
    });

    registry.watchFile("/tmp/a.txt", 1);
    registry.watchFile("/tmp/a.txt", 2);

    expect(registry.unwatchFile("/tmp/a.txt", 1)).toBe(true);
    expect(closeFns.get(resolvedA)).not.toHaveBeenCalled();

    expect(registry.unwatchFile("/tmp/a.txt", 2)).toBe(true);
    expect(closeFns.get(resolvedA)).toHaveBeenCalledOnce();
  });

  it("This feature is available in English only.", () => {
    const resolvedA = path.resolve("/tmp/a.txt");
    const resolvedB = path.resolve("/tmp/b.txt");
    const registry = createFileWatchRegistry({
      watch: watchMock,
      notifySubscriber: () => {},
    });

    registry.watchFile("/tmp/a.txt", 1);
    registry.watchFile("/tmp/b.txt", 1);
    registry.watchFile("/tmp/b.txt", 2);

    registry.unwatchAllForSubscriber(1);

    expect(closeFns.get(resolvedA)).toHaveBeenCalledOnce();
    expect(closeFns.get(resolvedB)).not.toHaveBeenCalled();

    callbacks.get(resolvedB)("rename");
    vi.advanceTimersByTime(60);
  });

  it("This feature is available in English only.", () => {
    const registry = createFileWatchRegistry({
      watch: vi.fn(() => { throw new Error("watch failed"); }),
      notifySubscriber: () => {},
    });

    expect(registry.watchFile(path.resolve("/tmp/a.txt"), 1)).toBe(false);
    expect(registry.unwatchFile(path.resolve("/tmp/a.txt"), 1)).toBe(true);
  });

  it("This feature is available in English only.", () => {
    const watcher = new EventEmitter() as EventEmitter & { close: ReturnType<typeof vi.fn> };
    watcher.close = vi.fn();
    const onError = vi.fn();
    const registry = createFileWatchRegistry({
      watch: vi.fn(() => watcher),
      notifySubscriber: () => {},
      onError,
    });
    const filePath = path.resolve("/tmp/a.txt");

    expect(registry.watchFile(filePath, 1)).toBe(true);
    const error = new Error("watch exploded");
    watcher.emit("error", error);

    expect(onError).toHaveBeenCalledWith(error, filePath);
    expect(registry.unwatchFile(filePath, 1)).toBe(true);
  });

  it("This feature is available in English only.", async () => {
    vi.useRealTimers();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "miko-file-watch-"));
    const filePath = path.join(dir, "note.md");
    fs.writeFileSync(filePath, "one\n", "utf-8");
    let readyResolve;
    let readyReject;
    const ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    const notified = [];
    const registry = createFileWatchRegistry({
      debounceMs: 5,
      watch: (targetPath, options, onChange) => {
        const watcher = createStableFileWatcher(
          targetPath,
          { ...options, usePolling: true, interval: 10 },
          onChange,
        );
        watcher.on("ready", readyResolve);
        watcher.on("error", readyReject);
        return watcher;
      },
      notifySubscriber: (_subscriberId, changedPath) => {
        notified.push(fs.readFileSync(changedPath, "utf-8"));
      },
    });

    try {
      expect(registry.watchFile(filePath, 1)).toBe(true);
      await ready;
      await new Promise(resolve => setTimeout(resolve, 50));

      fs.writeFileSync(filePath, "two\n", "utf-8");
      await vi.waitFor(() => expect(notified).toContain("two\n"));

      const tmpPath = `${filePath}.tmp`;
      fs.writeFileSync(tmpPath, "three\n", "utf-8");
      fs.renameSync(tmpPath, filePath);

      // Chokidar's atomic write normalization keeps a short merge window open
      // after rename-based writes; the contract here is that the subscription
      // survives the replacement once that normalization window has settled.
      await new Promise(resolve => setTimeout(resolve, 120));

      fs.writeFileSync(filePath, "four\n", "utf-8");
      await vi.waitFor(() => expect(notified).toContain("four\n"));
    } finally {
      registry.unwatchFile(filePath, 1);
      await registry.flushPendingCloses();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
