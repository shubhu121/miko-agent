

import { t } from "../lib/i18n.ts";
import { isLocalBaseUrl } from "../shared/net-utils.ts";
import { composeResolvedModelExecution } from "./model-execution-config.ts";


const ROLE_TO_PREF_KEY = {
  utility: "utility_model",
  utility_large: "utility_large_model",
};

function withCredentialMetadata(model: any, cred: any) {
  const stripsModelCredentials = cred?.credentialSource === "auth-storage"
    || cred?.credentialSource === "explicit-utility-override";
  const modelBase = stripsModelCredentials
    ? (() => {
        const {
          headers: _headers,
          accountId: _accountId,
          account_id: _accountIdSnake,
          accountID: _accountIdLegacy,
          ...rest
        } = model || {};
        return rest;
      })()
    : model;
  const headers = cred?.headers && typeof cred.headers === "object" ? cred.headers : {};
  const next = Object.keys(headers).length > 0
    ? { ...modelBase, headers: { ...(modelBase.headers || {}), ...headers } }
    : modelBase;
  return cred?.accountId ? { ...next, accountId: cred.accountId } : next;
}

function hasCredentialHeaders(cred: any) {
  return !!cred?.headers && typeof cred.headers === "object" && Object.keys(cred.headers).length > 0;
}

function normalizeExecutionCredential(cred: any) {
  if (!cred || typeof cred !== "object") return null;
  return {
    api: cred.api || "",
    apiKey: cred.apiKey ?? cred.api_key ?? "",
    baseUrl: cred.baseUrl ?? cred.base_url ?? "",
    headers: cred.headers && typeof cred.headers === "object" ? cred.headers : {},
    ...(cred.credentialSource || cred.credential_source
      ? { credentialSource: cred.credentialSource || cred.credential_source }
      : {}),
    ...(cred.accountId ? { accountId: cred.accountId } : {}),
  };
}

function hasUtilityApiOverride(utilApiOverride: any) {
  return !!(
    utilApiOverride?.provider
    || utilApiOverride?.api_key
    || utilApiOverride?.base_url
  );
}

export class ExecutionRouter {
  declare _resolveModel: (ref: string) => any;
  declare _resolveProviderCredentialsFresh: any;
  declare _providerRegistry: any;

  
  constructor(resolveModel: any, providerRegistry: any, resolveProviderCredentialsFresh: any = null) {
    this._resolveModel = resolveModel;
    this._providerRegistry = providerRegistry;
    this._resolveProviderCredentialsFresh = resolveProviderCredentialsFresh;
  }

  _resolveUtilityModels(agentConfig, sharedModels, options: any = {}) {
    const cfg = agentConfig || {};
    const requireUtilityLarge = options?.requireUtilityLarge !== false;
    const chatModelRef = cfg.models?.chat || null;
    const utilityModelRef = sharedModels?.utility || cfg.models?.utility || chatModelRef;
    const largeModelRef = sharedModels?.utility_large || cfg.models?.utility_large || chatModelRef;

    if (!utilityModelRef) throw new Error(t("error.noUtilityModel"));
    if (requireUtilityLarge && !largeModelRef) throw new Error(t("error.noUtilityLargeModel"));

    const utilModel = this._resolveModel(utilityModelRef);
    if (!utilModel) throw new Error(t("error.modelNotFound", { id: utilityModelRef }));
    const largeModel = largeModelRef ? this._resolveModel(largeModelRef) : null;
    if (largeModelRef && !largeModel) throw new Error(t("error.modelNotFound", { id: largeModelRef }));
    return { utilityModelRef, largeModelRef, utilModel, largeModel };
  }

  async _freshCredentials(provider) {
    if (typeof this._resolveProviderCredentialsFresh !== "function") {
      throw new Error(`Fresh credential resolver is required for provider "${provider}"`);
    }
    return normalizeExecutionCredential(await this._resolveProviderCredentialsFresh(provider));
  }

  
  resolve(roleOrRef, agentConfig, sharedModels, utilApiOverride) {
    const modelRef = this._resolveRef(roleOrRef, agentConfig, sharedModels);
    if (!modelRef) {
      throw new Error(t("error.noUtilityModel") + ` (role: ${roleOrRef})`);
    }

    const model = this._resolveModel(modelRef);
    if (!model) {
      throw new Error(t("error.modelNotFound", { id: modelRef }));
    }

    
    const isUtilityRole = roleOrRef === "utility" || roleOrRef === "utility_large";
    if (isUtilityRole && utilApiOverride?.api_key) {
      
      if (utilApiOverride.provider && utilApiOverride.provider !== model.provider) {
        throw new Error(t("error.utilityApiProviderMismatch", { model: modelRef }));
      }
      const overrideCred = this._providerRegistry.getCredentials(model.provider);
      const effectiveApi = model.api || overrideCred?.api;
      if (!effectiveApi) {
        throw new Error(t("error.providerMissingApi", { provider: model.provider }));
      }
      return {
        modelId: model.id,
        providerId: model.provider,
        api: effectiveApi,
        apiKey: utilApiOverride.api_key,
        baseUrl: utilApiOverride.base_url || model.baseUrl,
        headers: overrideCred?.headers || {},
      };
    }

    const cred = this._providerRegistry.getCredentials(model.provider);
    if (!cred) {
      throw new Error(t("error.providerMissingCreds", { provider: model.provider }));
    }
    const effectiveApi = model.api || cred.api;
    if (!effectiveApi) {
      throw new Error(t("error.providerMissingApi", { provider: model.provider }));
    }
    if (!cred.baseUrl || (!cred.apiKey && !hasCredentialHeaders(cred) && !this._allowsMissingApiKey(model.provider, cred.baseUrl))) {
      throw new Error(t("error.providerMissingCreds", { provider: model.provider }));
    }

    return {
      modelId: model.id,
      providerId: model.provider,
      api: effectiveApi,
      apiKey: cred.apiKey,
      baseUrl: cred.baseUrl,
      headers: cred.headers || {},
      ...(cred.accountId ? { accountId: cred.accountId } : {}),
    };
  }

  
  resolveUtilityConfig(agentConfig, sharedModels, utilApiOverride, options: any = {}) {
    const { utilityModelRef, utilModel, largeModel } = this._resolveUtilityModels(
      agentConfig,
      sharedModels,
      options,
    );

    
    let apiKey, baseUrl, api, utilCred;
    if (hasUtilityApiOverride(utilApiOverride)) {
      
      if (utilApiOverride.provider && utilApiOverride.provider !== utilModel.provider) {
        throw new Error(t("error.utilityApiProviderMismatch", { model: utilityModelRef }));
      }
      
      utilCred = this._providerRegistry.getCredentials(utilModel.provider);
      api = utilModel.api || utilCred?.api;
      apiKey = utilApiOverride.api_key || "";
      baseUrl = utilApiOverride.base_url || "";
      if (!api) throw new Error(t("error.providerMissingApi", { provider: utilModel.provider }));
      if (!baseUrl || (!apiKey && !hasCredentialHeaders(utilCred) && !this._allowsMissingApiKey(utilModel.provider, baseUrl))) {
        throw new Error(t("error.utilityApiMissingCreds", { provider: utilModel.provider }));
      }
    } else {
      utilCred = this._providerRegistry.getCredentials(utilModel.provider);
      api = utilModel.api || utilCred?.api;
      if (!api) throw new Error(t("error.providerMissingApi", { provider: utilModel.provider }));
      if (!utilCred?.baseUrl || (!utilCred.apiKey && !hasCredentialHeaders(utilCred) && !this._allowsMissingApiKey(utilModel.provider, utilCred.baseUrl))) {
        throw new Error(t("error.providerMissingCreds", { provider: utilModel.provider }));
      }
      apiKey = utilCred.apiKey;
      baseUrl = utilCred.baseUrl;
    }

    
    let large_api_key = largeModel ? apiKey : null;
    let large_base_url = largeModel ? baseUrl : null;
    let large_api = largeModel ? (largeModel.api || api) : null;
    let largeCred = largeModel ? utilCred : null;
    if (largeModel && largeModel.provider !== utilModel.provider) {
      largeCred = this._providerRegistry.getCredentials(largeModel.provider);
      large_api = largeModel.api || largeCred?.api;
      if (!large_api) throw new Error(t("error.providerMissingApi", { provider: largeModel.provider }));
      if (!largeCred?.baseUrl || (!largeCred.apiKey && !hasCredentialHeaders(largeCred) && !this._allowsMissingApiKey(largeModel.provider, largeCred.baseUrl))) {
        throw new Error(t("error.providerMissingCreds", { provider: largeModel.provider }));
      }
      large_api_key = largeCred.apiKey;
      large_base_url = largeCred.baseUrl;
    }

    return {
      utility: withCredentialMetadata(utilModel, utilCred),
      utility_large: largeModel ? withCredentialMetadata(largeModel, largeCred) : null,
      api_key: apiKey,
      base_url: baseUrl,
      api,
      large_api_key,
      large_base_url,
      large_api,
    };
  }

  
  async resolveUtilityConfigFresh(agentConfig, sharedModels, utilApiOverride, options: any = {}) {
    const { utilityModelRef, utilModel, largeModel } = this._resolveUtilityModels(
      agentConfig,
      sharedModels,
      options,
    );
    const usesOverride = hasUtilityApiOverride(utilApiOverride);

    let utilCred;
    let apiKey;
    let baseUrl;
    let api;
    if (usesOverride) {
      if (utilApiOverride.provider && utilApiOverride.provider !== utilModel.provider) {
        throw new Error(t("error.utilityApiProviderMismatch", { model: utilityModelRef }));
      }
      utilCred = {
        api: this._providerRegistry.get(utilModel.provider)?.api || "",
        apiKey: "",
        baseUrl: "",
        headers: {},
        credentialSource: "explicit-utility-override",
      };
      api = utilModel.api || utilCred.api;
      apiKey = utilApiOverride.api_key || "";
      baseUrl = utilApiOverride.base_url || "";
      if (!api) throw new Error(t("error.providerMissingApi", { provider: utilModel.provider }));
      if (!baseUrl || (!apiKey && !hasCredentialHeaders(utilCred) && !this._allowsMissingApiKey(utilModel.provider, baseUrl))) {
        throw new Error(t("error.utilityApiMissingCreds", { provider: utilModel.provider }));
      }
    } else {
      utilCred = await this._freshCredentials(utilModel.provider);
      api = utilModel.api || utilCred?.api;
      if (!api) throw new Error(t("error.providerMissingApi", { provider: utilModel.provider }));
      if (!utilCred?.baseUrl || (!utilCred.apiKey && !hasCredentialHeaders(utilCred) && !this._allowsMissingApiKey(utilModel.provider, utilCred.baseUrl))) {
        throw new Error(t("error.providerMissingCreds", { provider: utilModel.provider }));
      }
      apiKey = utilCred.apiKey;
      baseUrl = utilCred.baseUrl;
    }

    let large_api_key = largeModel ? apiKey : null;
    let large_base_url = largeModel ? baseUrl : null;
    let large_api = largeModel ? (largeModel.api || api) : null;
    let largeCred = largeModel ? utilCred : null;
    if (largeModel && largeModel.provider !== utilModel.provider) {
      largeCred = await this._freshCredentials(largeModel.provider);
      large_api = largeModel.api || largeCred?.api;
      if (!large_api) throw new Error(t("error.providerMissingApi", { provider: largeModel.provider }));
      if (!largeCred?.baseUrl || (!largeCred.apiKey && !hasCredentialHeaders(largeCred) && !this._allowsMissingApiKey(largeModel.provider, largeCred.baseUrl))) {
        throw new Error(t("error.providerMissingCreds", { provider: largeModel.provider }));
      }
      large_api_key = largeCred.apiKey;
      large_base_url = largeCred.baseUrl;
    }

    const utilExecution = composeResolvedModelExecution({ model: utilModel, credential: utilCred });
    const largeExecution = largeModel
      ? composeResolvedModelExecution({ model: largeModel, credential: largeCred })
      : null;

    return {
      utility: utilExecution.model,
      utility_large: largeExecution?.model || null,
      api_key: apiKey,
      base_url: baseUrl,
      api,
      headers: utilExecution.headers,
      large_api_key,
      large_base_url,
      large_api,
      large_headers: largeExecution?.headers || null,
    };
  }

  
  _resolveRef(roleOrRef, agentConfig, sharedModels) {
    const cfg = agentConfig || {};

    
    switch (roleOrRef) {
      case "chat":
        return cfg.models?.chat || null;
      case "utility":
        return sharedModels?.utility || cfg.models?.utility || null;
      case "utility_large":
        return sharedModels?.utility_large || cfg.models?.utility_large || null;
      case "embed":
        return cfg.embedding_api?.model || null;
      default:
        
        return roleOrRef;
    }
  }

  _allowsMissingApiKey(provider, baseUrl) {
    return this._providerRegistry?.allowsMissingApiKey?.(provider, baseUrl)
      ?? isLocalBaseUrl(baseUrl);
  }
}
