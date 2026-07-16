   
                    
  
                                                                    
                                          
                                           
   
import { EventBusCapabilityDirectory } from "./event-bus-capabilities.ts";
import { createModuleLogger } from "../lib/debug-log.ts";

const log = createModuleLogger("event-bus");

export class BusNoHandlerError extends Error {
  declare type: any;
  constructor(type) {
    super(`No handler registered for "${type}"`);
    this.name = "BusNoHandlerError";
    this.type = type;
  }
}

export class BusTimeoutError extends Error {
  declare type: any;
  constructor(type, ms) {
    super(`Request "${type}" timeout after ${ms}ms`);
    this.name = "BusTimeoutError";
    this.type = type;
  }
}

export class EventBus {
  declare _capabilities: any;
  declare _globalSubs: any;
  declare _handlers: any;
  declare _nextId: any;
  declare _sessionIndex: any;
  declare _subscribers: any;
  constructor() {
                                                                           
    this._subscribers = new Map();
    this._nextId = 0;
                                                            
    this._handlers = new Map();
    this._capabilities = new EventBusCapabilityDirectory();

                    
                                                 
    /** @type {Set<number>} */
    this._globalSubs = new Set();
                           
    /** @type {Map<string, Set<number>>} */
    this._sessionIndex = new Map();
  }

     
         
                                                             
                             
                                                           
                                                                    
                                    
     
  subscribe(callback, filter: any = {}) {
    const id = ++this._nextId;
                                                  
    const normalizedFilter = { ...filter };
    if (Array.isArray(filter.types)) {
      normalizedFilter.types = new Set(filter.types);
    }
    this._subscribers.set(id, { callback, filter: normalizedFilter });

           
    if (normalizedFilter.sessionPath) {
      let set = this._sessionIndex.get(normalizedFilter.sessionPath);
      if (!set) { set = new Set(); this._sessionIndex.set(normalizedFilter.sessionPath, set); }
      set.add(id);
    } else {
      this._globalSubs.add(id);
    }

    return () => {
      const entry = this._subscribers.get(id);
      this._subscribers.delete(id);
      if (entry?.filter.sessionPath) {
        const set = this._sessionIndex.get(entry.filter.sessionPath);
        if (set) { set.delete(id); if (set.size === 0) this._sessionIndex.delete(entry.filter.sessionPath); }
      } else {
        this._globalSubs.delete(id);
      }
    };
  }

     
                       
                                                 
                                                     
     
  emit(event, sessionPath) {
                                                
    const ids = this._globalSubs;
    const sessionIds = sessionPath ? this._sessionIndex.get(sessionPath) : null;

    const notify = (id) => {
      const entry = this._subscribers.get(id);
      if (!entry) return;
      if (entry.filter.types && !entry.filter.types.has(event.type)) return;
      try { entry.callback(event, sessionPath); } catch (err) {
        log.error(`subscriber error: ${err.message}`);
      }
    };

    for (const id of ids) notify(id);
    if (sessionIds) {
      for (const id of sessionIds) notify(id);
    }
  }

                        
  clear() {
    this._subscribers.clear();
    this._handlers.clear();
    this._globalSubs.clear();
    this._sessionIndex.clear();
  }

  static SKIP = Symbol.for("miko.event-bus.skip");

     
            
                                        
                                                                             
                                 
     
  handle(type, handler, options: any = {}) {
    if (!this._handlers.has(type)) this._handlers.set(type, []);
    this._handlers.get(type).push(handler);
    if (options.capability) {
      this.registerCapability({ ...options.capability, type });
    }
    return () => {
      const arr = this._handlers.get(type);
      if (!arr) return;
      const idx = arr.indexOf(handler);
      if (idx !== -1) arr.splice(idx, 1);
      if (arr.length === 0) this._handlers.delete(type);
      if (options.capability && options.unregisterCapability !== false) {
        this.unregisterCapability(type);
      }
    };
  }

     
                                    
                         
                            
                              
                                            
                            
     
  async request(type, payload, options: any = {}) {
    const handlers = this._handlers.get(type);
    if (!handlers || handlers.length === 0) throw new BusNoHandlerError(type);
    const timeout = options.timeout ?? 30000;
    const requestContext = normalizeRequestContext(options);

    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new BusTimeoutError(type, timeout)), timeout);
    });

    try {
      return await Promise.race([
        this._tryHandlers(type, handlers, payload, requestContext),
        timeoutPromise,
      ]);
    } finally {
      clearTimeout(timerId);
    }
  }

  async _tryHandlers(type, handlers, payload, requestContext = null) {
    for (const h of [...handlers]) {
      const result = await h(payload, requestContext);
      if (result !== EventBus.SKIP) return result;
    }
    throw new BusNoHandlerError(type);
  }

     
                              
                         
                       
     
  hasHandler(type) {
    const arr = this._handlers.get(type);
    return arr != null && arr.length > 0;
  }

  registerCapability(capability) {
    return this._capabilities.register(capability);
  }

  unregisterCapability(type) {
    this._capabilities.unregister(type);
  }

  getCapability(type) {
    const capability = this._capabilities.get(type);
    return capability ? { ...capability, available: this.hasHandler(type) } : null;
  }

  listCapabilities() {
    return this._capabilities.list().map((capability) => ({
      ...capability,
      available: this.hasHandler(capability.type),
    }));
  }
}

function normalizeRequestContext(options: any = {}) {
  const caller = options?.caller;
  if (!caller || typeof caller !== "object" || Array.isArray(caller)) return null;
  return {
    caller,
  };
}
