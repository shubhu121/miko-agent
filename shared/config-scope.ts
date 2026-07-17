// shared/config-scope.js

import { CONFIG_SCHEMA } from './config-schema.ts';


export function splitByScope(partial) {
  const global = [];
  const agent = {};

  
  for (const key of Object.keys(partial)) {
    agent[key] = partial[key];
  }
  for (const path of Object.keys(CONFIG_SCHEMA)) {
    const parts = path.split('.');
    if (parts.length === 2 && agent[parts[0]] && typeof agent[parts[0]] === 'object') {
      agent[parts[0]] = { ...agent[parts[0]] };
    }
  }

  for (const [path, def] of Object.entries(CONFIG_SCHEMA)) {
    if (def.scope !== 'global' || !def.setter) continue;

    const parts = path.split('.');
    if (parts.length === 1) {
      if (parts[0] in agent && agent[parts[0]] !== undefined) {
        global.push({ key: path, value: agent[parts[0]], setter: def.setter });
        delete agent[parts[0]];
      }
    } else if (parts.length === 2) {
      const [parent, child] = parts;
      if (agent[parent]?.[child] !== undefined) {
        global.push({ key: path, value: agent[parent][child], setter: def.setter });
        delete agent[parent][child];
        if (Object.keys(agent[parent]).length === 0) delete agent[parent];
      }
    }
    
  }

  return { global, agent };
}


export function injectGlobalFields(config, engine) {
  for (const [path, def] of Object.entries(CONFIG_SCHEMA)) {
    if (def.scope !== 'global' || !def.getter) continue;
    if (typeof engine[def.getter] !== 'function') continue;

    const value = engine[def.getter]();
    const parts = path.split('.');

    if (parts.length === 1) {
      config[parts[0]] = value;
    } else if (parts.length === 2) {
      const [parent, child] = parts;
      if (!config[parent] || typeof config[parent] !== 'object') config[parent] = {};
      config[parent][child] = value;
    }
  }
}
