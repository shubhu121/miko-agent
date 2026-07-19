import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("../core/desktop-session-submit.ts", async (importOriginal) => {
  const mod: any = await importOriginal();
  return {
    ...mod,
    submitDesktopSessionMessage: vi.fn(),
    submitDesktopSessionInterjection: vi.fn(),
  };
});
import { submitDesktopSessionMessage, submitDesktopSessionInterjection } from "../core/desktop-session-submit.ts";
import { deliverAgentMessage, AGENT_MESSAGE_SOURCE } from "../lib/session-collab/delivery.ts";

const FROM = { agentId: "miko", agentName: "Miko" };
function makeEngine(streaming = false) {
  return {
    getSessionManifest: vi.fn().mockReturnValue({ currentLocator: { path: "/tmp/dst.jsonl" }, ownerAgentId: "kimi" }),
    isSessionStreaming: vi.fn().mockReturnValue(streaming),
  };
}

beforeEach(() => {
  vi.mocked(submitDesktopSessionMessage).mockReset().mockResolvedValue({} as any);
  vi.mocked(submitDesktopSessionInterjection).mockReset().mockResolvedValue({ steered: true } as any);
});

describe("deliverAgentMessage", () => {
  it("This feature is available in English only.", async () => {
    await deliverAgentMessage(makeEngine(false), { targetSessionId: "sid-1", message: "This feature is available in English only.", from: FROM });
    expect(submitDesktopSessionInterjection).not.toHaveBeenCalled();
    const call = vi.mocked(submitDesktopSessionMessage).mock.calls[0][1];
    expect(call.sessionId).toBe("sid-1");
    expect(call.sessionPath).toBe("/tmp/dst.jsonl");
    expect(call.text).toContain("Miko");
    expect(call.text).toContain("This feature is available in English only.");
    expect(call.text).not.toBe("This feature is available in English only.");
    expect(call.displayMessage.text).toBe("This feature is available in English only.");
    expect(call.displayMessage.source).toBe(AGENT_MESSAGE_SOURCE);
    expect(call.displayMessage.origin).toEqual({ kind: "agent", agentId: "miko", agentName: "Miko" });
  });

  it("This feature is available in English only.", async () => {
    const result = await deliverAgentMessage(makeEngine(true), { targetSessionId: "sid-1", message: "This feature is available in English only.", from: FROM });
    expect(submitDesktopSessionMessage).not.toHaveBeenCalled();
    expect(submitDesktopSessionInterjection).toHaveBeenCalledTimes(1);
    const call = vi.mocked(submitDesktopSessionInterjection).mock.calls[0][1];
    expect(call.sessionId).toBe("sid-1");
    expect(call.sessionPath).toBe("/tmp/dst.jsonl");
    expect(call.text).toContain("Miko");
    expect(call.text).toContain("This feature is available in English only.");
    expect(call.text).not.toBe("This feature is available in English only.");
    expect(call.displayMessage.text).toBe("This feature is available in English only.");
    expect(call.displayMessage.source).toBe(AGENT_MESSAGE_SOURCE);
    expect(call.displayMessage.origin).toEqual({ kind: "agent", agentId: "miko", agentName: "Miko" });
    expect(result).toEqual({ accepted: true, targetSessionId: "sid-1" });
  });

  it("This feature is available in English only.", async () => {
    vi.mocked(submitDesktopSessionMessage).mockRejectedValueOnce(new Error("session_busy"));
    const result = await deliverAgentMessage(makeEngine(false), { targetSessionId: "sid-1", message: "This feature is available in English only.", from: FROM });
    expect(submitDesktopSessionMessage).toHaveBeenCalledTimes(1);
    expect(submitDesktopSessionInterjection).toHaveBeenCalledTimes(1);
    const call = vi.mocked(submitDesktopSessionInterjection).mock.calls[0][1];
    expect(call.text).toContain("This feature is available in English only.");
    expect(result).toEqual({ accepted: true, targetSessionId: "sid-1" });
  });

  it("This feature is available in English only.", async () => {
    vi.mocked(submitDesktopSessionMessage).mockImplementationOnce(() => {
      throw new Error("session_busy");
    });
    const result = await deliverAgentMessage(makeEngine(false), { targetSessionId: "sid-1", message: "This feature is available in English only.", from: FROM });
    expect(submitDesktopSessionMessage).toHaveBeenCalledTimes(1);
    expect(submitDesktopSessionInterjection).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ accepted: true, targetSessionId: "sid-1" });
  });

  it("This feature is available in English only.", async () => {
    const engine = makeEngine(false);
    vi.mocked(engine.getSessionManifest).mockReturnValue(null as any);
    await expect(
      deliverAgentMessage(engine, { targetSessionId: "sid-missing", message: "This feature is available in English only.", from: FROM }),
    ).rejects.toThrow(/session_not_found/);
    expect(submitDesktopSessionMessage).not.toHaveBeenCalled();
    expect(submitDesktopSessionInterjection).not.toHaveBeenCalled();
  });

  it("This feature is available in English only.", async () => {
    vi.mocked(submitDesktopSessionMessage).mockRejectedValueOnce(new Error("session_busy"));
    vi.mocked(submitDesktopSessionInterjection).mockRejectedValueOnce(new Error("session_busy"));
    await expect(
      deliverAgentMessage(makeEngine(false), { targetSessionId: "sid-1", message: "This feature is available in English only.", from: FROM }),
    ).rejects.toThrow("session_busy");
    expect(submitDesktopSessionMessage).toHaveBeenCalledTimes(1);
    expect(submitDesktopSessionInterjection).toHaveBeenCalledTimes(1);
  });

  it("This feature is available in English only.", async () => {
    vi.mocked(submitDesktopSessionMessage).mockRejectedValueOnce(new Error("boom"));
    await expect(
      deliverAgentMessage(makeEngine(false), { targetSessionId: "sid-1", message: "This feature is available in English only.", from: FROM }),
    ).rejects.toThrow("boom");
    expect(submitDesktopSessionInterjection).not.toHaveBeenCalled();
  });
});
