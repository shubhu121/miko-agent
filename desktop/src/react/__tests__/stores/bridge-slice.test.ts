import { describe, it, expect, beforeEach } from 'vitest';
import { createBridgeSlice, type BridgeSlice } from '../../stores/bridge-slice';

function makeSlice(): BridgeSlice {
  let state: BridgeSlice;
  const set = (partial: Partial<BridgeSlice> | ((s: BridgeSlice) => Partial<BridgeSlice>)) => {
    const patch = typeof partial === 'function' ? partial(state) : partial;
    state = { ...state, ...patch };
  };
  state = createBridgeSlice(set);
  return new Proxy({} as BridgeSlice, {
    get: (_, key: string) => (state as unknown as Record<string, unknown>)[key],
  });
}

describe('bridge-slice', () => {
  let slice: BridgeSlice;

  beforeEach(() => {
    slice = makeSlice();
  });

  it("This feature is available in English only.", () => {
    expect(slice.bridgeLatestMessage).toBeNull();
    expect(slice.bridgeStatusTrigger).toBe(0);
  });

  it("This feature is available in English only.", () => {
    const msg = { platform: 'telegram', sessionKey: 'tg_123', direction: 'in', sender: 'user1', text: 'hello', isGroup: false, ts: Date.now() };
    slice.addBridgeMessage(msg);
    expect(slice.bridgeLatestMessage).toEqual(msg);
  });

  it("This feature is available in English only.", () => {
    slice.addBridgeMessage({ platform: 'telegram', sessionKey: 'a', direction: 'in', sender: 'u1', text: '1', isGroup: false, ts: 1 });
    slice.addBridgeMessage({ platform: 'telegram', sessionKey: 'b', direction: 'out', sender: 'u2', text: '2', isGroup: false, ts: 2 });
    expect(slice.bridgeLatestMessage?.sessionKey).toBe('b');
    expect(slice.bridgeLatestMessage?.text).toBe('2');
  });

  it("This feature is available in English only.", () => {
    slice.triggerBridgeReload();
    expect(slice.bridgeStatusTrigger).toBe(1);
    slice.triggerBridgeReload();
    expect(slice.bridgeStatusTrigger).toBe(2);
  });

  it("This feature is available in English only.", () => {
    slice.addBridgeMessage({ platform: 'telegram', sessionKey: 'x', direction: 'in', sender: 'u1', text: 'msg', isGroup: false, ts: 1 });
    slice.triggerBridgeReload();
    expect(slice.bridgeLatestMessage?.text).toBe('msg');
    expect(slice.bridgeStatusTrigger).toBe(1);
  });
});
