// shared/config-schema.js



/** @type {Record<string, FieldDef>} */
export const CONFIG_SCHEMA = {
  locale:                       { scope: 'global', setter: 'setLocale',         getter: 'getLocale', defaultValue: '' },
  timezone:                     { scope: 'global', setter: 'setTimezone',       getter: 'getTimezone', defaultValue: '' },
  sandbox:                      { scope: 'global', setter: 'setSandbox',        getter: 'getSandbox', defaultValue: true },
  sandbox_network:              { scope: 'global', setter: 'setSandboxNetwork', getter: 'getSandboxNetwork', defaultValue: true },
  hardware_acceleration:        { scope: 'global', setter: 'setHardwareAcceleration', getter: 'getHardwareAcceleration', defaultValue: true },
  file_backup:                  { scope: 'global', setter: 'setFileBackup',    getter: 'getFileBackup' },
  update_channel:               { scope: 'global', setter: 'setUpdateChannel',  getter: 'getUpdateChannel', defaultValue: 'stable' },
  auto_check_updates:           { scope: 'global', setter: 'setAutoCheckUpdates', getter: 'getAutoCheckUpdates', defaultValue: true },
  keep_awake:                   { scope: 'global', setter: 'setKeepAwake', getter: 'getKeepAwake', defaultValue: false },
  thinking_level:               { scope: 'global', setter: 'setThinkingLevel',  getter: 'getThinkingLevel', defaultValue: 'medium' },
  editor:                       { scope: 'global', setter: 'setEditor',         getter: 'getEditor' },
  'capabilities.learn_skills':  { scope: 'global', setter: 'setLearnSkills',    getter: 'getLearnSkills', prefsPath: 'learn_skills' },
  'desk.heartbeat_master':      { scope: 'global', setter: 'setHeartbeatMaster', getter: 'getHeartbeatMaster', prefsPath: 'heartbeat_master', defaultValue: true },
  'channels.enabled':           { scope: 'global', setter: 'setChannelsEnabled', getter: 'getChannelsEnabled', prefsPath: 'channels_enabled', defaultValue: false },
  'bridge.permissionMode':      { scope: 'global', setter: 'setBridgePermissionMode', getter: 'getBridgePermissionMode', defaultValue: 'auto' },
  'bridge.readOnly':            { scope: 'global', setter: 'setBridgeReadOnly', getter: 'getBridgeReadOnly', defaultValue: false },
  'bridge.receiptEnabled':      { scope: 'global', setter: 'setBridgeReceiptEnabled', getter: 'getBridgeReceiptEnabled', defaultValue: true },
  'bridge.richStreamingEnabled': { scope: 'global', setter: 'setBridgeRichStreamingEnabled', getter: 'getBridgeRichStreamingEnabled', defaultValue: true },
  'automation.permissionMode':  { scope: 'global', setter: 'setAutomationPermissionMode', getter: 'getAutomationPermissionMode', defaultValue: 'auto' },
  network_proxy:                { scope: 'global', setter: 'setNetworkProxy', getter: 'getNetworkProxy' },
};



