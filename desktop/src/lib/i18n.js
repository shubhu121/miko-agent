

const i18n = {
  /** User-facing product identity; runtime and storage identifiers stay legacy-compatible. */
  productName: "Miko",

  
  _data: {},

  
  _agentOverrides: {},

  
  locale: "en",

  
  defaultName: "Miko",

  
  async load(locale) {
    const key = this._resolveKey(locale);
    this.locale = key;
    try {
      const res = await fetch(`./locales/${key}.json`);
      if (!res.ok) throw new Error(res.statusText);
      this._data = await res.json();
    } catch (err) {
      console.error(`[i18n] Failed to load locale "${key}":`, err);
      if (key !== "en") {
        try {
          const fb = await fetch("./locales/en.json");
          this._data = await fb.json();
        } catch { this._data = {}; }
      } else {
        this._data = {};
      }
    }
  },

  
  _resolveKey(_locale) {
    return "en";
  },

  
  setAgentOverrides(overrides) {
    this._agentOverrides = overrides || {};
  },

  
  _get(path) {
    const exactOverride = this._agentOverrides?.[path];
    if (exactOverride !== undefined && exactOverride !== null) return exactOverride;
    const exact = this._data?.[path];
    if (exact !== undefined && exact !== null) return exact;
    const keys = path.split(".");
    const override = keys.reduce((obj, k) => obj?.[k], this._agentOverrides);
    if (override !== undefined && override !== null) return override;
    return keys.reduce((obj, k) => obj?.[k], this._data);
  },

  
  t(path, vars) {
    let val = this._get(path);
    if (val === undefined || val === null) return path; 
    if (typeof val !== "string") return val;

    
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        val = val.replaceAll(`{${k}}`, v);
      }
    }
    
    val = val.replaceAll("{name}", this.defaultName);

    return val
      .replaceAll("Miko", this.productName)
      .replace(/\bMiko\b/g, this.productName)
      .replace(/\bMiko\b/g, this.productName);
  },
};


function t(path, vars) {
  return i18n.t(path, vars);
}


window.i18n = i18n;
window.t = t;
