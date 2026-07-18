const ZH_STRINGS: Record<string, string> = {
  'input.attachmentFile': "This feature is available in English only.",
  'input.thinkingLevel.off': "This feature is available in English only.",
  'input.thinkingLevel.auto': "This feature is available in English only.",
  'input.thinkingLevel.medium': "This feature is available in English only.",
  'input.thinkingLevel.high': "This feature is available in English only.",
  'input.thinkingLevel.xhigh': "This feature is available in English only.",
  'input.thinkingLevel.max': "This feature is available in English only.",
  'input.thinkingLevel.low': "This feature is available in English only.",
  'input.thinkingDesc.off': "This feature is available in English only.",
  'input.thinkingDesc.auto': "This feature is available in English only.",
  'input.thinkingDesc.medium': "This feature is available in English only.",
  'input.thinkingDesc.high': "This feature is available in English only.",
  'input.thinkingDesc.xhigh': "This feature is available in English only.",
  'input.thinkingDesc.max': "This feature is available in English only.",
  'input.thinkingDesc.low': "This feature is available in English only.",
  'approval.computerApp.controlTitle': "This feature is available in English only.",
  'approval.computerApp.defaultAppName': "This feature is available in English only.",
  'chat.workflowInline.running': "This feature is available in English only.",
  'chat.workflowInline.done': "This feature is available in English only.",
  'chat.workflowInline.failed': "This feature is available in English only.",
  'chat.workflowInline.aborted': "This feature is available in English only.",
  'settings.skills.toggleEnableNamed': "This feature is available in English only.",
  'settings.skills.toggleDisableNamed': "This feature is available in English only.",
  'preview.fileMovedOrDeleted': "This feature is available in English only.",
};

export function createTestTranslator(extra: Record<string, string> = {}) {
  const strings = { ...ZH_STRINGS, ...extra };
  return (key: string, params?: Record<string, string | number>) => {
    const template = strings[key];
    if (!template) return key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`));
  };
}

export function installWindowTestT(extra?: Record<string, string>) {
  const t = createTestTranslator(extra);
  window.t = t as typeof window.t;
  return t;
}
