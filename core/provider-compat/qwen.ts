/** Handles the Qwen enable_thinking compatibility field. */
export function matches(model) {
  return Array.isArray(model?.quirks) && model.quirks.includes("enable_thinking");
}

export function apply(payload, model, options: any = {}) {
  if (options?.mode === "utility" || (options?.mode === "chat" && (isDisabledThinkingLevel(options?.reasoningLevel) || model?.reasoning === false))) {
    return { ...payload, enable_thinking: false };
  }
  return payload;
}

function isDisabledThinkingLevel(value) {
  if (value === false) return true;
  if (value == null) return false;
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "" || normalized === "none" || normalized === "off" || normalized === "disabled";
}
