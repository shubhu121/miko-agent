

import fs from "fs";
import path from "path";
import { t } from "../i18n.ts";
import {
  BLOCKED_FILES,
  BLOCKED_DIRS,
  READ_ONLY_AGENT_FILES,
  READ_ONLY_AGENT_DIRS,
  READ_ONLY_HOME_DIRS,
  READ_WRITE_AGENT_DIRS,
  READ_WRITE_AGENT_FILES,
  READ_WRITE_HOME_DIRS,
} from "./policy.ts";

export const AccessLevel = {
  BLOCKED: "blocked",
  READ_ONLY: "read_only",
  READ_WRITE: "read_write",
  FULL: "full",
};


const OP_REQUIREMENTS = {
  read: new Set([AccessLevel.READ_ONLY, AccessLevel.READ_WRITE, AccessLevel.FULL]),
  write: new Set([AccessLevel.READ_WRITE, AccessLevel.FULL]),
  delete: new Set([AccessLevel.FULL]),
};

export class PathGuard {
  declare _fullAccess: boolean;
  declare mikoHome: string;
  declare agentDir: string;
  declare workspaceRoots: string[];
  declare policyWritablePaths: string[];
  declare allowExternalReads: boolean;

  
  constructor(policy) {
    if (policy.mode === "full-access") {
      this._fullAccess = true;
      return;
    }
    this._fullAccess = false;
    this.mikoHome = this._resolveReal(policy.mikoHome) || path.resolve(policy.mikoHome);
    this.agentDir = this._resolveReal(policy.agentDir) || path.resolve(policy.agentDir);
    const roots = Array.isArray(policy.workspaceRoots) && policy.workspaceRoots.length > 0
      ? policy.workspaceRoots
      : [policy.workspace].filter(Boolean);
    this.workspaceRoots = roots.map((root) => this._resolveReal(root) || path.resolve(root));
    this.policyWritablePaths = (policy.writablePaths || [])
      .map((root) => this._resolveReal(root) || path.resolve(root));
    this.allowExternalReads = policy.allowExternalReads === true;
  }

  
  _resolveReal(p) {
    const abs = path.resolve(p);
    try {
      return fs.realpathSync(abs);
    } catch (err) {
      if (err.code !== "ENOENT") return null;

      const pending = [];
      let current = abs;
      while (true) {
        const parent = path.dirname(current);
        if (parent === current) return null; 
        pending.push(path.basename(current));
        try {
          const realParent = fs.realpathSync(parent);
          pending.reverse();
          return path.join(realParent, ...pending);
        } catch (e) {
          if (e.code !== "ENOENT") return null;
          current = parent;
        }
      }
    }
  }

  
  _isInside(target, base) {
    return target === base || target.startsWith(base + path.sep);
  }

  
  getAccessLevel(rawPath) {
    const resolved = this._resolveReal(rawPath);
    if (!resolved) return AccessLevel.BLOCKED;

    
    for (const f of BLOCKED_FILES) {
      if (resolved === path.join(this.mikoHome, f)) return AccessLevel.BLOCKED;
    }

    
    for (const d of BLOCKED_DIRS) {
      if (this._isInside(resolved, path.join(this.mikoHome, d))) {
        return AccessLevel.BLOCKED;
      }
    }

    
    for (const f of READ_ONLY_AGENT_FILES) {
      if (resolved === path.join(this.agentDir, f)) return AccessLevel.READ_ONLY;
    }

    
    for (const d of READ_ONLY_AGENT_DIRS) {
      if (this._isInside(resolved, path.join(this.agentDir, d))) {
        return AccessLevel.READ_ONLY;
      }
    }

    
    for (const d of READ_ONLY_HOME_DIRS) {
      if (this._isInside(resolved, path.join(this.mikoHome, d))) {
        return AccessLevel.READ_ONLY;
      }
    }

    
    for (const d of READ_WRITE_AGENT_DIRS) {
      if (this._isInside(resolved, path.join(this.agentDir, d))) {
        return AccessLevel.READ_WRITE;
      }
    }

    
    for (const f of READ_WRITE_AGENT_FILES) {
      if (resolved === path.join(this.agentDir, f)) return AccessLevel.READ_WRITE;
    }

    
    for (const d of READ_WRITE_HOME_DIRS) {
      if (this._isInside(resolved, path.join(this.mikoHome, d))) {
        return AccessLevel.READ_WRITE;
      }
    }

    
    if (this._isInside(resolved, this.mikoHome)) {
      return this.allowExternalReads ? AccessLevel.READ_ONLY : AccessLevel.BLOCKED;
    }

    
    for (const root of this.workspaceRoots) {
      if (this._isInside(resolved, root)) {
        return AccessLevel.FULL;
      }
    }

    
    for (const root of this.policyWritablePaths) {
      if (this._isInside(resolved, root)) {
        return AccessLevel.READ_WRITE;
      }
    }

    
    if (this.allowExternalReads) return AccessLevel.READ_ONLY;
    return AccessLevel.BLOCKED;
  }

  
  check(absolutePath, operation) {
    if (this._fullAccess) return { allowed: true };
    const level = this.getAccessLevel(absolutePath);
    const allowed = OP_REQUIREMENTS[operation]?.has(level) ?? false;

    if (allowed) return { allowed: true };

    const resolved = this._resolveReal(absolutePath) || absolutePath;
    const opLabel = { read: t("sandbox.opRead"), write: t("sandbox.opWrite"), delete: t("sandbox.opDelete") }[operation] || operation;
    return {
      allowed: false,
      reason: t("sandbox.denied", { op: opLabel, path: resolved, level }),
    };
  }

}
