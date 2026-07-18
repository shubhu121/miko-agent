export interface BridgeIncomingMessage {
  platform: string;
  sessionKey: string;
  direction: string;
  sender: string;
  text: string;
  isGroup: boolean;
  ts: number;
  agentId?: string;
}

export interface BridgeSlice {
  
  bridgeLatestMessage: BridgeIncomingMessage | null;
  
  bridgeStatusTrigger: number;
  
  addBridgeMessage: (msg: BridgeIncomingMessage) => void;
  
  triggerBridgeReload: () => void;
}

export const createBridgeSlice = (
  set: (partial: Partial<BridgeSlice> | ((s: BridgeSlice) => Partial<BridgeSlice>)) => void,
): BridgeSlice => ({
  bridgeLatestMessage: null,
  bridgeStatusTrigger: 0,
  addBridgeMessage: (msg) => set({ bridgeLatestMessage: msg }),
  triggerBridgeReload: () =>
    set((s) => ({ bridgeStatusTrigger: s.bridgeStatusTrigger + 1 })),
});
