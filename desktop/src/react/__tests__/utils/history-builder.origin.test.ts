import { describe, expect, it } from 'vitest';
import { buildItemsFromHistory } from '../../utils/history-builder';

describe("This feature is available in English only.", () => {
  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: '0',
        role: 'user',
        content: "This feature is available in English only.",
        origin: { kind: 'agent', agentId: 'miko', agentName: 'Miko' },
        displayText: "This feature is available in English only.",
        timestamp: 1,
      }],
    } as any);

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.origin).toEqual({ kind: 'agent', agentId: 'miko', agentName: 'Miko' });
    expect(first.data.text).toBe("This feature is available in English only.");
    expect(first.data.textHtml).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: '0',
        role: 'user',
        content: "This feature is available in English only.",
        timestamp: 1,
      }],
    } as any);

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.origin).toBeUndefined();
    expect(first.data.text).toContain("This feature is available in English only.");
  });

  it("This feature is available in English only.", () => {
    const items = buildItemsFromHistory({
      messages: [{
        id: '0',
        role: 'user',
        content: "This feature is available in English only.",
        origin: { kind: 'agent', agentId: 'miko', agentName: 'Miko' },
        timestamp: 1,
      }],
    } as any);

    const first = items[0];
    expect(first.type).toBe('message');
    if (first.type !== 'message') throw new Error('expected message');
    expect(first.data.origin).toEqual({ kind: 'agent', agentId: 'miko', agentName: 'Miko' });
    
    expect(first.data.text).toBe("This feature is available in English only.");
  });
});
