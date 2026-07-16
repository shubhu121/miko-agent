

const PENDING_DEFAULT_TTL_MS = 5 * 60 * 1000;  





export class RcStateStore {
  declare _pending: Map<string, any>;
  declare _attachment: Map<string, any>;
  declare _attachedDesktopToBridge: Map<string, string>;
  declare _ttlMs: number;

  /**
   * @param {{ ttlMs?: number }} [opts]
   */
  constructor({ ttlMs = PENDING_DEFAULT_TTL_MS } = {}) {
    /** @type {Map<string, PendingSpec>} */
    this._pending = new Map();
    /** @type {Map<string, Attachment>} */
    this._attachment = new Map();
    /** @type {Map<string, string>} */
    this._attachedDesktopToBridge = new Map();
    this._ttlMs = ttlMs;
  }

  // ── pending-selection ──────────────────────────────────────

  /**
   * @param {string} sessionKey
   * @param {Omit<PendingSpec, 'expiresAt'>} spec
   */
  setPending(sessionKey, spec) {
    const expiresAt = Date.now() + this._ttlMs;
    this._pending.set(sessionKey, { ...spec, expiresAt });
  }

  /**
   * @param {string} sessionKey
   * @returns {PendingSpec | null}
   */
  getPending(sessionKey) {
    const p = this._pending.get(sessionKey);
    if (!p) return null;
    if (Date.now() >= p.expiresAt) {
      
      this._pending.delete(sessionKey);
      return null;
    }
    return p;
  }

  clearPending(sessionKey) {
    this._pending.delete(sessionKey);
  }

  /** @returns {boolean} */
  isPending(sessionKey) {
    return this.getPending(sessionKey) !== null;
  }

  // ── attachment ─────────────────────────────────────────────

  
  attach(sessionKey, desktopSessionPath, meta: any = {}) {
    const current = this._attachment.get(sessionKey) ?? null;
    const holderSessionKey = this._attachedDesktopToBridge.get(desktopSessionPath) ?? null;
    if (holderSessionKey && holderSessionKey !== sessionKey) {
      throw new Error("This feature is available in English only.");
    }

    if (current?.desktopSessionPath && current.desktopSessionPath !== desktopSessionPath) {
      this._attachedDesktopToBridge.delete(current.desktopSessionPath);
    }

    const next = {
      desktopSessionPath,
      attachedAt: Date.now(),
      platform: meta.platform || null,
      chatId: meta.chatId || null,
      agentId: meta.agentId || null,
      messageThreadId: meta.messageThreadId || null,
    };
    this._attachment.set(sessionKey, next);
    this._attachedDesktopToBridge.set(desktopSessionPath, sessionKey);
    return next;
  }

  /**
   * @param {string} sessionKey
   * @returns {Attachment | null}
   */
  getAttachment(sessionKey) {
    return this._attachment.get(sessionKey) ?? null;
  }

  /**
   * @param {string} desktopSessionPath
   * @returns {string | null}
   */
  getAttachedBridgeSessionKey(desktopSessionPath) {
    return this._attachedDesktopToBridge.get(desktopSessionPath) ?? null;
  }

  /**
   * @param {string} desktopSessionPath
   * @returns {boolean}
   */
  isDesktopSessionAttached(desktopSessionPath) {
    return this._attachedDesktopToBridge.has(desktopSessionPath);
  }

  detach(sessionKey) {
    const current = this._attachment.get(sessionKey) ?? null;
    if (current?.desktopSessionPath) {
      const holderSessionKey = this._attachedDesktopToBridge.get(current.desktopSessionPath) ?? null;
      if (holderSessionKey === sessionKey) {
        this._attachedDesktopToBridge.delete(current.desktopSessionPath);
      }
    }
    this._attachment.delete(sessionKey);
    return current;
  }

  /** @returns {boolean} */
  isAttached(sessionKey) {
    return this._attachment.has(sessionKey);
  }

  
  invalidateDesktopSession(desktopSessionPath) {
    const detachedAttachments = [];
    const holderSessionKey = this._attachedDesktopToBridge.get(desktopSessionPath) ?? null;
    if (holderSessionKey) {
      const detached = this.detach(holderSessionKey);
      if (detached) {
        detachedAttachments.push({
          sessionKey: holderSessionKey,
          ...detached,
        });
      }
    }

    const clearedPendingSessionKeys = [];
    const now = Date.now();
    for (const [sessionKey, pending] of Array.from(this._pending.entries())) {
      if (now >= pending.expiresAt) {
        this._pending.delete(sessionKey);
        continue;
      }
      if (pending.options?.some(option => option.path === desktopSessionPath)) {
        this._pending.delete(sessionKey);
        clearedPendingSessionKeys.push(sessionKey);
      }
    }

    return { detachedAttachments, clearedPendingSessionKeys };
  }

  
  releaseDesktopSession(desktopSessionPath) {
    return this.invalidateDesktopSession(desktopSessionPath);
  }

  // ── utility ────────────────────────────────────────────────

  
  reset(sessionKey) {
    this._pending.delete(sessionKey);
    this.detach(sessionKey);
  }

  
  listAttachments() {
    return Array.from(this._attachment.entries()).map(([sessionKey, att]) => ({
      sessionKey,
      ...att,
    }));
  }
}
