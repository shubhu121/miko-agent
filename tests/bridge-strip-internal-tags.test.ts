

import { describe, it, expect, vi } from "vitest";
import os from "os";

import {
  stripInternalTags,
  StreamCleaner,
  __test_cleanReplyForPlatform,
  __test_cleanStreamSnapshot,
  BridgeManager,
} from "../lib/bridge/bridge-manager.ts";
import { sanitizeBridgeVisibleText } from "../shared/bridge-visible-text.ts";

vi.mock("../lib/debug-log.js", () => ({
  debugLog: () => null,
  createModuleLogger: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));


const NS_PREFIX = "antml" + ":";
const nsOpen = (tag, attrs = "") => `<${NS_PREFIX}${tag}${attrs}>`;
const nsClose = (tag) => `</${NS_PREFIX}${tag}>`;

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(sanitizeBridgeVisibleText("<t>05-28 17:13</t> hello")).toBe("hello");
  });

  it("This feature is available in English only.", () => {
    expect(sanitizeBridgeVisibleText("This feature is available in English only.")).toBe("This feature is available in English only.");
  });
});



describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("a</think></think>b")).toBe("ab");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("a<thinking>x</thinking>b")).toBe("ab");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const input = '<function_calls><invoke name="read"><parameter name="path">a.txt</parameter></invoke></function_calls>done';
    expect(stripInternalTags(input)).toBe("done");
  });

  it("This feature is available in English only.", () => {
    const input =
      nsOpen("function_calls") +
      nsOpen("invoke", ' name="bash"') +
      nsOpen("parameter", ' name="command"') + "pwd" +
      nsClose("parameter") + nsClose("invoke") + nsClose("function_calls") +
      "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });
});







describe("This feature is available in English only.", () => {
  
  
  const TAGS = ["invoke", "parameter", "tool_calls", "function_calls"];

  
  
  
  for (const tag of TAGS) {
    it("This feature is available in English only.", () => {
      const input = "This feature is available in English only.";
      expect(stripInternalTags(input)).toBe(
        "This feature is available in English only.",
      );
    });

    it("This feature is available in English only.", () => {
      const input = "This feature is available in English only.";
      expect(stripInternalTags(input)).toBe("This feature is available in English only.");
    });

    it("This feature is available in English only.", () => {
      const input = "This feature is available in English only.";
      expect(stripInternalTags(input)).toBe(
        "This feature is available in English only.",
      );
    });

    it("This feature is available in English only.", () => {
      
      
      
      const input = "This feature is available in English only.";
      expect(stripInternalTags(input)).toBe("This feature is available in English only.");
    });
  }

  
  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });
});





describe("This feature is available in English only.", () => {
  
  const inputs = [
    "This feature is available in English only.",
    "This feature is available in English only.",
    "This feature is available in English only.",
    "This feature is available in English only.",
  ];

  for (const input of inputs) {
    it("This feature is available in English only.", () => {
      
      const edit = stripInternalTags(input);
      
      const block = feedAll(new StreamCleaner(), [input]);

      
      
      expect(block.trim()).toBe(edit);
      
      expect(edit).toContain("This feature is available in English only.");
      expect(block).toContain("This feature is available in English only.");
    });
  }
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  
  
  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("This feature is available in English only.")).toBe("This feature is available in English only.");
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe(input);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe(input);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe(input);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe(input);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(stripInternalTags("")).toBe("");
    expect(stripInternalTags(undefined)).toBe("");
    expect(stripInternalTags(null)).toBe("");
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(stripInternalTags(input)).toBe(input);
  });
});



function feedAll(cleaner, deltas) {
  let out = "";
  for (const d of deltas) out += cleaner.feed(d);
  out += cleaner.flushLineBuf();
  return out;
}

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(feedAll(new StreamCleaner(), ["This feature is available in English only."])).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(feedAll(new StreamCleaner(), ["This feature is available in English only."])).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(feedAll(new StreamCleaner(), ["This feature is available in English only."])).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(feedAll(new StreamCleaner(), ["This feature is available in English only."]))
      .toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(feedAll(new StreamCleaner(), ["This feature is available in English only."])).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(feedAll(new StreamCleaner(), ["This feature is available in English only."]))
      .toBe("This feature is available in English only.");
  });
});

describe("This feature is available in English only.", () => {
  function singleVsSplit(full, splitAt) {
    const single = feedAll(new StreamCleaner(), [full]);
    const split = feedAll(new StreamCleaner(), [full.slice(0, splitAt), full.slice(splitAt)]);
    return { single, split };
  }

  it("This feature is available in English only.", () => {
    const full = "This feature is available in English only.";
    const at = full.indexOf("</think>") + 4; 
    const { single, split } = singleVsSplit(full, at);
    expect(split).toBe(single);
    expect(split).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const full = "This feature is available in English only.";
    const at = 6; // <t>05- | 28 ...
    const { single, split } = singleVsSplit(full, at);
    expect(split).toBe(single);
    expect(split).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const full = "This feature is available in English only.";
    const at = full.indexOf("<think>") + 3;
    const { single, split } = singleVsSplit(full, at);
    expect(split).toBe(single);
    expect(split).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const full = "This feature is available in English only.";
    const at = full.indexOf("</think>") + 4;
    const { single, split } = singleVsSplit(full, at);
    expect(split).toBe(single);
    expect(split).toBe("This feature is available in English only.");
  });
});

describe("This feature is available in English only.", () => {
  
  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(feedAll(new StreamCleaner(), [input])).toBe(input);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(feedAll(new StreamCleaner(), [input])).toBe(input);
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(feedAll(new StreamCleaner(), [input])).toBe(input);
  });

  it("This feature is available in English only.", () => {
    expect(feedAll(new StreamCleaner(), ["This feature is available in English only."])).toBe("This feature is available in English only.");
  });

  
  
  
  
  
});



describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(__test_cleanReplyForPlatform("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const input = "This feature is available in English only.";
    expect(__test_cleanReplyForPlatform(input)).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(__test_cleanReplyForPlatform("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(__test_cleanReplyForPlatform("This feature is available in English only.")).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(__test_cleanReplyForPlatform("This feature is available in English only."))
      .toBe("This feature is available in English only.");
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    expect(__test_cleanStreamSnapshot("This feature is available in English only.").text).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    
    expect(__test_cleanStreamSnapshot("This feature is available in English only.").text).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(__test_cleanStreamSnapshot("This feature is available in English only.").text).toBe("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    expect(__test_cleanStreamSnapshot("This feature is available in English only.").text).toBe("This feature is available in English only.");
  });
});



function makeBridge() {
  const engine = {
    getAgent: vi.fn(() => ({ agentName: "Miko", config: {} })),
    agentName: "Miko",
    mikoHome: os.tmpdir(),
    getBridgeMediaPublicBaseUrl: () => "",
  };
  const hub = { eventBus: { emit: vi.fn() }, subscribe: vi.fn(() => null) };
  return new BridgeManager({ engine, hub });
}

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", async () => {
    const bm = makeBridge();
    const sent = [];
    const adapter = {
      streamingCapabilities: { mode: "block", scopes: ["dm"] },
      sendBlockReply: vi.fn(async (_chatId, text) => { sent.push(text); }),
      sendReply: vi.fn(async (_chatId, text) => { sent.push(text); }),
    };
    const delivery = bm._createStreamDelivery({ adapter, chatId: "c1", isGroup: false, platform: "qq" } as any);

    
    for (const d of ["This feature is available in English only.", "</think>", "This feature is available in English only."]) delivery.onDelta?.(d, "");
    await delivery.finish("This feature is available in English only.");

    const joined = sent.join("\n");
    expect(joined).not.toContain("</think>");
    expect(joined).toContain("This feature is available in English only.");
    expect(joined).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", async () => {
    const bm = makeBridge();
    const sent = [];
    const adapter = {
      streamingCapabilities: { mode: "block", scopes: ["dm"] },
      sendBlockReply: vi.fn(async (_chatId, text) => { sent.push(text); }),
      sendReply: vi.fn(async (_chatId, text) => { sent.push(text); }),
    };
    const delivery = bm._createStreamDelivery({ adapter, chatId: "c1", isGroup: false, platform: "qq" } as any);
    for (const d of ["This feature is available in English only.", '<parameter name="command">ls\n']) {
      delivery.onDelta?.(d, "");
    }
    await delivery.finish("This feature is available in English only.");
    const joined = sent.join("\n");
    expect(joined).not.toContain("<tool_calls>");
    expect(joined).not.toContain("<invoke");
    expect(joined).toContain("This feature is available in English only.");
  });
});

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", async () => {
    const bm = makeBridge();
    const updates = [];
    let state = null;
    const adapter = {
      streamingCapabilities: { mode: "edit_message", scopes: ["dm"], minIntervalMs: 0, maxChars: 150000 },
      startStreamReply: vi.fn(async (_c, text) => { state = { messageId: "m1" }; updates.push(text); return state; }),
      updateStreamReply: vi.fn(async (_c, _s, text) => { updates.push(text); }),
      finishStreamReply: vi.fn(async (_c, _s, text) => { updates.push(text); }),
      sendReply: vi.fn(async (_c, text) => { updates.push(text); }),
    };
    const delivery = bm._createStreamDelivery({ adapter, chatId: "c1", isGroup: false, platform: "feishu" } as any);

    const full = "This feature is available in English only.";
    delivery.onDelta?.(full, full);
    await delivery.finish(full);

    const last = updates[updates.length - 1];
    expect(last).not.toContain("<t>");
    expect(last).not.toContain("<tool_calls>");
    expect(last).not.toContain("<invoke");
    expect(last).toContain("This feature is available in English only.");
    expect(last).toContain("This feature is available in English only.");
  });
});
