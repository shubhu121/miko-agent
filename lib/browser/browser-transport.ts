


export class IpcTransport {
  declare _boundListener: any;

  constructor() {
    this._boundListener = null;
  }

  get connected() {
    return typeof process.send === "function";
  }

  send(msg: any) {
    process.send(msg);
  }

  onMessage(handler: (msg: any) => void) {
    
    if (this._boundListener) {
      process.off("message", this._boundListener);
    }
    this._boundListener = (msg) => handler(msg);
    process.on("message", this._boundListener);
  }
}


export class WsTransport {
  declare _ws: any;
  declare _handler: any;
  declare _boundListener: any;

  constructor() {
    this._ws = null;
    this._handler = null;
    this._boundListener = null;
  }

  get connected() {
    return this._ws?.readyState === 1; // WebSocket.OPEN
  }

  
  attach(ws: any) {
    
    if (this._ws && this._boundListener) {
      this._ws.off("message", this._boundListener);
    }
    this._ws = ws;
    if (this._handler && ws) {
      this._boundListener = (data) => {
        let msg;
        try { msg = JSON.parse(data); } catch { return; }
        this._handler(msg);
      };
      ws.on("message", this._boundListener);
    }
  }

  detach() {
    if (this._ws && this._boundListener) {
      this._ws.off("message", this._boundListener);
    }
    this._ws = null;
    this._boundListener = null;
  }

  send(msg: any) {
    if (!this.connected) throw new Error("Browser WS transport not connected");
    this._ws.send(JSON.stringify(msg));
  }

  onMessage(handler: (msg: any) => void) {
    this._handler = handler;
    
    if (this._ws) {
      this.attach(this._ws);
    }
  }
}
