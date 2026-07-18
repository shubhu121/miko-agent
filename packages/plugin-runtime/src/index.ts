import type {
  PluginResourceDescriptor,
  PluginResourceEdit,
  PluginResourceListItem,
  PluginResourceListResult,
  PluginResourceMaterializeResult,
  PluginResourceMoveResult,
  PluginResourceReadResult,
  PluginResourceRef,
  PluginResourceSearchMatch,
  PluginResourceSearchOptions,
  PluginResourceSearchResult,
  PluginResourceStat,
  PluginResourceTrashOptions,
  PluginResourceTrashResult,
  PluginResourceVersion,
  PluginResourceWatchTarget,
  PluginResourceWriteConflictResult,
  PluginResourceWriteExpectedVersionResult,
  PluginResourceMutationResult,
} from '@miko/plugin-protocol';

export type MaybePromise<T> = T | Promise<T>;

export type JsonSchema = Record<string, unknown>;

export const MIKO_BUS_SKIP = Symbol.for('miko.event-bus.skip');

export interface MikoToolResult {
  content?: Array<Record<string, unknown>>;
  details?: Record<string, unknown>;
}

export interface MikoSessionRef {
  sessionId: string;
  sessionPath?: string | null;
  legacySessionPath?: string | null;
}

export type MikoSessionTarget = string | MikoSessionRef | {
  sessionId?: string | null;
  sessionPath?: string | null;
  path?: string | null;
  legacySessionPath?: string | null;
};

export interface MikoSessionFile {
  id?: string | null;
  fileId?: string | null;
  sessionId?: string | null;
  sessionPath?: string | null;
  filePath?: string;
  realPath?: string;
  displayName?: string;
  filename?: string;
  label?: string;
  ext?: string | null;
  mime?: string;
  size?: number;
  kind?: string;
  isDirectory?: boolean;
  origin?: string;
  operations?: unknown[];
  createdAt?: number | string;
  storageKind?: string;
  status?: string;
  missingAt?: number | string | null;
  resource?: MikoResourceEnvelope;
  [key: string]: unknown;
}

export interface MikoResourceEnvelope {
  schemaVersion: 1;
  resourceId: string;
  name: string;
  studioId: string;
  type: 'file' | string;
  source: 'session_file' | string;
  sourceId?: string;
  fileId?: string;
  displayName?: string;
  filename?: string;
  ext?: string | null;
  mime?: string;
  size?: number | null;
  kind?: string;
  isDirectory?: boolean;
  origin?: string;
  operations?: string[];
  createdAt?: number | string;
  mtimeMs?: number;
  lifecycle: {
    status: string;
    missingAt: number | string | null;
  };
  storage: {
    provider: string;
    storageKind?: string;
    localOnly?: boolean;
  };
  links: {
    self: string;
    content?: string;
  };
  [key: string]: unknown;
}

export type MikoResourceRef = PluginResourceRef;
export type MikoResourceVersion = PluginResourceVersion;
export type MikoResourceDescriptor = PluginResourceDescriptor;
export type MikoResourceStat = PluginResourceStat;
export type MikoResourceReadResult = PluginResourceReadResult;
export type MikoResourceMutationResult = PluginResourceMutationResult;
export type MikoResourceWriteConflictResult = PluginResourceWriteConflictResult;
export type MikoResourceWriteExpectedVersionResult = PluginResourceWriteExpectedVersionResult;
export type MikoResourceMoveResult = PluginResourceMoveResult;
export type MikoResourceTrashOptions = PluginResourceTrashOptions;
export type MikoResourceTrashResult = PluginResourceTrashResult;
export type MikoResourceEdit = PluginResourceEdit;
export type MikoResourceListItem = PluginResourceListItem;
export type MikoResourceListResult = PluginResourceListResult;
export type MikoResourceSearchOptions = PluginResourceSearchOptions;
export type MikoResourceSearchMatch = PluginResourceSearchMatch;
export type MikoResourceSearchResult = PluginResourceSearchResult;
export type MikoResourceMaterializeResult = PluginResourceMaterializeResult;
export type MikoResourceWatchTarget = PluginResourceWatchTarget;

export interface MikoPluginResourceMutationOptions {
  emit?: boolean;
}

export interface MikoPluginResourceWatchOptions {
  purpose?: string | null;
  sessionRef?: MikoSessionRef | { sessionPath?: string | null; path?: string | null } | null;
  /** @deprecated Prefer sessionId/sessionRef on the invocation context. */
  sessionPath?: string | null;
}

export interface MikoResourceWatchSubscription {
  subscriptionId: string;
  resourceKeys: string[];
  unsubscribe(): boolean;
  close(): boolean;
}

export interface MikoPluginResources {
  stat(ref: MikoResourceRef | Record<string, unknown>): Promise<MikoResourceStat>;
  read(ref: MikoResourceRef | Record<string, unknown>): Promise<MikoResourceReadResult>;
  list(ref: MikoResourceRef | Record<string, unknown>): Promise<MikoResourceListResult>;
  search(ref: MikoResourceRef | Record<string, unknown>, options?: MikoResourceSearchOptions): Promise<MikoResourceSearchResult>;
  materialize(ref: MikoResourceRef | Record<string, unknown>): Promise<MikoResourceMaterializeResult>;
  write(ref: MikoResourceRef | Record<string, unknown>, content: string | Uint8Array | ArrayBuffer, options?: MikoPluginResourceMutationOptions): Promise<MikoResourceMutationResult>;
  writeExpectedVersion(ref: MikoResourceRef | Record<string, unknown>, content: string | Uint8Array | ArrayBuffer, expectedVersion: MikoResourceVersion, options?: MikoPluginResourceMutationOptions): Promise<MikoResourceWriteExpectedVersionResult>;
  edit(ref: MikoResourceRef | Record<string, unknown>, edits: MikoResourceEdit[], options?: MikoPluginResourceMutationOptions): Promise<MikoResourceMutationResult>;
  mkdir(ref: MikoResourceRef | Record<string, unknown>, options?: MikoPluginResourceMutationOptions): Promise<MikoResourceMutationResult>;
  delete(ref: MikoResourceRef | Record<string, unknown>, options?: MikoPluginResourceMutationOptions): Promise<MikoResourceMutationResult>;
  copy(from: MikoResourceRef | Record<string, unknown>, to: MikoResourceRef | Record<string, unknown>, options?: MikoPluginResourceMutationOptions): Promise<MikoResourceMutationResult>;
  rename(from: MikoResourceRef | Record<string, unknown>, to: MikoResourceRef | Record<string, unknown>, options?: MikoPluginResourceMutationOptions): Promise<MikoResourceMoveResult>;
  move(from: MikoResourceRef | Record<string, unknown>, to: MikoResourceRef | Record<string, unknown>, options?: MikoPluginResourceMutationOptions): Promise<MikoResourceMoveResult>;
  trash(ref: MikoResourceRef | Record<string, unknown>, trashOptions?: MikoResourceTrashOptions, options?: MikoPluginResourceMutationOptions): Promise<MikoResourceTrashResult>;
  watch(ref: MikoResourceRef | Record<string, unknown>, options?: MikoPluginResourceWatchOptions): MikoResourceWatchSubscription;
  subscribe(resources: Array<MikoResourceRef | Record<string, unknown>>, options?: MikoPluginResourceWatchOptions): MikoResourceWatchSubscription;
  resolveWatchTarget?(ref: MikoResourceRef | Record<string, unknown>, options?: MikoPluginResourceWatchOptions): MikoResourceWatchTarget;
}

export interface MikoExecutionBoundary {
  schemaVersion: 1;
  boundaryId: string;
  kind: 'local_process' | string;
  serverNodeId: string;
  studioId: string;
  workbench?: {
    kind: string;
    root: string | null;
    [key: string]: unknown;
  };
  sandbox?: {
    kind: string;
    enforcedBy?: string;
    [key: string]: unknown;
  };
  filesystem?: {
    policy: string;
    [key: string]: unknown;
  };
  network?: {
    policy: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface MikoSessionFileMediaItem {
  type: 'session_file';
  fileId: string;
  sessionId?: string | null;
  sessionPath?: string | null;
  filePath?: string;
  label?: string;
  mime?: string;
  size?: number;
  kind?: string;
  [key: string]: unknown;
}

export interface MikoStagedSessionFile {
  file?: MikoSessionFile | null;
  sessionFile?: MikoSessionFile | null;
  mediaItem: MikoSessionFileMediaItem;
}

export interface MikoMediaDetails {
  media: {
    items: MikoSessionFileMediaItem[];
  };
}

export interface MikoChatSurfaceCardOptions {
  title?: string;
  description?: string;
  mode?: 'transcript' | 'full' | string;
  composer?: boolean;
  aspectRatio?: string;
}

export interface MikoChatSurfaceCardDetails {
  type: 'chat.surface';
  pluginId: string;
  sessionId: string;
  sessionRef: MikoSessionRef;
  sessionPath?: string;
  title?: string;
  description: string;
  mode: 'transcript' | 'full' | string;
  composer?: boolean;
  aspectRatio?: string;
}

export interface MikoPluginNetworkFetchInit extends RequestInit {
  timeoutMs?: number;
  cacheTtlMs?: number;
  maxResponseBytes?: number;
}

export interface MikoPluginNetwork {
  fetch(input: string | URL | Request, init?: MikoPluginNetworkFetchInit): Promise<Response>;
}

export interface MikoToolContext {
  serverId: string;
  serverNodeId?: string;
  userId: string;
  studioId: string;
  connectionKind?: 'local' | 'lan' | 'custom_remote' | 'relay' | 'cloud' | string;
  credentialKind?: 'none' | 'loopback_token' | 'device_credential' | 'user_session' | string;
  platformAccountId?: string | null;
  officialServiceKind?: 'relay' | 'cloud_studio' | 'inference' | 'billing' | string | null;
  executionBoundary?: MikoExecutionBoundary;
  pluginId: string;
  pluginDir: string;
  dataDir: string;
  capabilities?: string[];
  sensitiveCapabilities?: string[];
  sessionId?: string | null;
  sessionRef?: MikoSessionRef | null;
  /** @deprecated Use sessionId/sessionRef. Kept for legacy plugins. */
  sessionPath?: string | null;
  bus: MikoEventBus;
  network: MikoPluginNetwork;
  resources: MikoPluginResources;
  config: MikoPluginConfigStore;
  log: MikoPluginLogger;
  registerSessionFile?: (input: Record<string, unknown>) => MikoSessionFile;
  stageFile?: (input: Record<string, unknown>) => MikoStagedSessionFile;
  [key: string]: unknown;
}

export type MikoToolSessionPermissionKind =
  | 'read'
  | 'read_only'
  | 'plugin_output'
  | 'session_file_output'
  | 'workspace_write'
  | 'external_side_effect'
  | 'review'
  | string;

export interface MikoToolSessionPermission<Input = unknown> {
  /**
   * True means the tool only reads already-authorized data and may run in
   * read-only sessions without reviewer escalation.
   */
  readOnly?: boolean;
  /**
   * Host approval classification hint. Unknown or external side-effect kinds
   * remain reviewer-bound in Auto mode.
   */
  kind?: MikoToolSessionPermissionKind;
  /**
   * Override Auto-mode handling for a declared non-read tool.
   */
  auto?: 'allow' | 'review';
  description?: string;
  sideEffect?: Record<string, unknown>;
  describeSideEffect?: (input: Input) => Record<string, unknown> | null | undefined;
}

export interface MikoToolDefinition<Input = unknown, Output = unknown> {
  name: string;
  description: string;
  parameters?: JsonSchema;
  promptSnippet?: string;
  promptGuidelines?: string;
  sessionPermission?: MikoToolSessionPermission<Input>;
  metadata?: Record<string, unknown>;
  invocationStyle?: 'sdk_tool' | 'pi_tool';
  execute(input: Input, ctx: MikoToolContext): MaybePromise<Output>;
}

export type MikoSlashPermission = 'anyone' | 'owner' | 'admin';
export type MikoSlashScope = 'session' | 'global';

export interface MikoCommandContext {
  [key: string]: unknown;
}

export interface MikoCommandResult {
  reply?: string;
  silent?: boolean;
  error?: string;
  [key: string]: unknown;
}

export interface MikoCommandDefinition<Context = MikoCommandContext> {
  name: string;
  aliases?: string[];
  description?: string;
  scope?: MikoSlashScope;
  permission?: MikoSlashPermission;
  usage?: string;
  handler?: (ctx: Context) => MaybePromise<MikoCommandResult | void>;
  execute?: (ctx: Context) => MaybePromise<unknown>;
}

export type MikoProviderRuntimeKind = 'http' | 'oauth-http' | 'local-cli' | 'browser-cli' | 'plugin';
export type MikoMediaCapabilityName = 'imageGeneration' | 'videoGeneration' | 'speechGeneration' | string;
export type MikoMediaOutputKind = 'file_glob' | 'json_stdout' | 'url_stdout';
export type MikoCliBindingSource = 'prompt' | 'modelId' | 'inputFile' | 'outputDir' | 'size' | 'duration';

export type MikoCliArgBinding =
  | { literal: string }
  | { option: string; from: MikoCliBindingSource };

export interface MikoCliOutputContract {
  kind: MikoMediaOutputKind;
  directory?: MikoCliBindingSource | string;
  pattern?: string;
  [key: string]: unknown;
}

export interface MikoCliCommandSpec {
  executable: string;
  args: MikoCliArgBinding[];
  timeoutMs: number;
  output: MikoCliOutputContract;
}

export interface MikoProviderRuntime {
  kind: MikoProviderRuntimeKind;
  protocolId?: string;
  command?: MikoCliCommandSpec;
  [key: string]: unknown;
}

export interface MikoProviderChatCapability {
  projection?: 'models-json' | 'sdk-auth-alias' | 'none' | string;
  credentialSource?: 'provider-catalog' | 'auth-storage' | 'none';
  runtimeProviderId?: string;
  displayProviderId?: string;
  allowListSource?: string;
  [key: string]: unknown;
}

export interface MikoMediaReferenceImageLimits {
  min?: number;
  max?: number;
  [key: string]: unknown;
}

export interface MikoMediaInputLimits {
  referenceImages?: MikoMediaReferenceImageLimits;
  [key: string]: unknown;
}

export interface MikoProviderMediaMode {
  id: string;
  label?: string;
  parameterSchema?: JsonSchema;
  defaults?: Record<string, unknown>;
  inputLimits?: MikoMediaInputLimits;
  pricing?: Record<string, unknown>;
  agentHints?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MikoProviderMediaModel {
  id: string;
  displayName?: string;
  protocolId: string;
  inputs?: string[];
  outputs?: string[];
  supportsEdit?: boolean;
  aliases?: string[];
  credentialLaneId?: string;
  modes?: MikoProviderMediaMode[];
  parameterSchema?: JsonSchema;
  defaults?: Record<string, unknown>;
  inputLimits?: MikoMediaInputLimits;
  [key: string]: unknown;
}

export interface MikoProviderCredentialLane {
  id: string;
  kind?: string;
  label?: string;
  [key: string]: unknown;
}

export interface MikoProviderMediaCapability {
  defaultModelId?: string;
  models: MikoProviderMediaModel[];
  credentialLanes?: MikoProviderCredentialLane[];
  [key: string]: unknown;
}

export interface MikoProviderCapabilities {
  chat?: MikoProviderChatCapability;
  media?: Partial<Record<MikoMediaCapabilityName, MikoProviderMediaCapability>>;
  [key: string]: unknown;
}

export interface MikoProviderSource {
  kind: 'builtin' | 'plugin' | 'user' | string;
  pluginId?: string;
  [key: string]: unknown;
}

export interface MikoProviderDefinition {
  id: string;
  displayName?: string;
  name?: string;
  authType?: 'api-key' | 'oauth' | 'none' | string;
  authJsonKey?: string;
  defaultBaseUrl?: string;
  defaultApi?: string;
  api?: string;
  models?: unknown[];
  runtime?: MikoProviderRuntime;
  capabilities?: MikoProviderCapabilities;
  source?: MikoProviderSource;
  [key: string]: unknown;
}

export type MikoExtensionFactory<Pi = unknown> = (pi: Pi) => MaybePromise<void>;

export interface MikoPluginConfigStore {
  get<T = unknown>(key: string, options?: MikoPluginConfigScopeOptions): MaybePromise<T | undefined>;
  getAll?(options?: MikoPluginConfigScopeOptions & { redacted?: boolean }): MaybePromise<Record<string, unknown>>;
  set<T = unknown>(key: string, value: T, options?: MikoPluginConfigScopeOptions): MaybePromise<void>;
  setMany?(values: Record<string, unknown>, options?: MikoPluginConfigScopeOptions): MaybePromise<Record<string, unknown>>;
  getSchema?(): JsonSchema;
}

export interface MikoPluginConfigScopeOptions {
  scope?: 'global' | 'per-agent' | 'per-session';
  agentId?: string;
  sessionId?: string;
  /** @deprecated Use sessionId. Kept for legacy config scopes. */
  sessionPath?: string;
}

export interface MikoSessionTurnContext {
  system?: string | Array<string | { text: string; label?: string }>;
  beforeUser?: string | Array<string | { text: string; label?: string }>;
  afterUser?: string | Array<string | { text: string; label?: string }>;
  metadata?: Record<string, unknown>;
}

export interface MikoSessionCreateInput {
  agentId?: string | null;
  cwd?: string | null;
  memoryEnabled?: boolean;
  model?: string | { id?: string; modelId?: string; provider?: string; providerId?: string };
  workspaceFolders?: string[];
  authorizedFolders?: string[];
  thinkingLevel?: string;
  permissionMode?: string;
  ownerPluginId?: string | null;
  kind?: string | null;
  sessionKind?: string | null;
  visibility?: 'public' | 'plugin_private' | 'private' | string;
}

export interface MikoSessionSendInput {
  text: string;
  context?: MikoSessionTurnContext | null;
  images?: unknown[];
  videos?: unknown[];
  audios?: unknown[];
  imageAttachmentPaths?: string[];
  videoAttachmentPaths?: string[];
  audioAttachmentPaths?: string[];
  [key: string]: unknown;
}

export interface MikoSessionListFilter {
  agentId?: string;
  ownerPluginId?: string;
  includePluginPrivate?: boolean;
}

export interface MikoSessionUpdateInput {
  title?: string;
  pinned?: boolean;
  projectId?: string | null;
  thinkingLevel?: string;
  permissionMode?: string;
  ownerPluginId?: string | null;
  kind?: string | null;
  visibility?: 'public' | 'plugin_private' | 'private' | string;
}

export interface MikoCreateInput {
  id?: string;
  name: string;
  yuan?: string;
  ownerPluginId?: string | null;
  visibility?: 'public' | 'plugin_private' | 'private' | string;
  kind?: string | null;
  initialFiles?: Record<string, string>;
  initialMemory?: Record<string, unknown>;
  memoryPolicy?: { enabled?: boolean };
}

export interface MikoUpdateInput {
  name?: string;
  yuan?: string;
  ownerPluginId?: string | null;
  visibility?: 'public' | 'plugin_private' | 'private' | string;
  kind?: string | null;
  memoryPolicy?: { enabled?: boolean };
  toolPolicy?: { disabled?: string[] };
  config?: Record<string, unknown>;
}

export interface MikoModelSampleInput {
  systemPrompt?: string;
  messages: Array<{ role: string; content: unknown }>;
  sessionId?: string;
  sessionRef?: MikoSessionRef;
  /** @deprecated Use sessionId/sessionRef. */
  sessionPath?: string;
  agentId?: string;
  temperature?: number;
  maxTokens?: number;
  operation?: string;
}

export interface MikoMediaProviderFilter {
  capability?: string;
}

export interface MikoMediaModelRef {
  providerId?: string;
  provider?: string;
  modelId?: string;
  model?: string;
  capability?: string;
  credentialLaneId?: string;
}

export type MikoSessionFileReference =
  | { kind: 'session_file'; fileId: string }
  | { type: 'session_file'; fileId: string };

export type MikoGenerateImageReference = MikoSessionFileReference;

export interface MikoMediaDelivery {
  mode?: 'session' | 'response' | string;
  ttlMs?: number;
  [key: string]: unknown;
}

export interface MikoGenerateImageInput {
  sessionId?: string;
  sessionRef?: MikoSessionRef;
  /** @deprecated Use sessionId/sessionRef. */
  sessionPath?: string;
  prompt: string;
  count?: number;
  image?: MikoGenerateImageReference | MikoGenerateImageReference[];
  referenceImages?: MikoGenerateImageReference[];
  ratio?: string;
  resolution?: string;
  quality?: string;
  mode?: string;
  options?: Record<string, unknown>;
  model?: string;
  provider?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  delivery?: MikoMediaDelivery;
  deliveryMode?: string;
  deliveryTarget?: unknown;
}

export interface MikoGenerateVideoInput {
  sessionId?: string;
  sessionRef?: MikoSessionRef;
  /** @deprecated Use sessionId/sessionRef. */
  sessionPath?: string;
  prompt: string;
  image?: MikoGenerateImageReference | MikoGenerateImageReference[] | string;
  referenceImages?: MikoGenerateImageReference[];
  duration?: number;
  ratio?: string;
  resolution?: string;
  mode?: string;
  options?: Record<string, unknown>;
  model?: string;
  provider?: string;
  input?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  delivery?: MikoMediaDelivery;
  deliveryMode?: string;
  deliveryTarget?: unknown;
}

export interface MikoGenerateMediaInput {
  kind?: 'image' | 'video' | 'audio' | 'image_generation' | 'video_generation' | 'speech_recognition' | 'asr' | 'transcription' | string;
  type?: string;
  mediaKind?: string;
  sessionId?: string;
  sessionRef?: MikoSessionRef;
  /** @deprecated Use sessionId/sessionRef. */
  sessionPath?: string;
  fileId?: string;
  prompt?: string;
  image?: MikoGenerateImageReference | MikoGenerateImageReference[] | string;
  referenceImages?: MikoGenerateImageReference[];
  duration?: number;
  ratio?: string;
  resolution?: string;
  quality?: string;
  mode?: string;
  options?: Record<string, unknown>;
  model?: string;
  provider?: string;
  delivery?: MikoMediaDelivery;
  deliveryMode?: string;
  input?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MikoTranscribeAudioInput {
  sessionId?: string;
  sessionRef?: MikoSessionRef;
  /** @deprecated Use sessionId/sessionRef. */
  sessionPath?: string;
  fileId: string;
  language?: string;
  providerId?: string;
  provider?: string;
  modelId?: string;
  model?: string;
}

export interface MikoTranscribeAudioResult {
  ok: true;
  transcription: unknown;
  taskId?: string;
  stream?: unknown;
}

export interface MikoEventBus {
  emit(event: unknown, sessionPath?: string | null): unknown;
  emit(type: string, payload?: unknown): unknown;
  subscribe(callback: (event: unknown, sessionPath?: string | null) => void, filter?: MikoBusSubscriptionFilter): () => void;
  subscribe(type: string, handler: (payload: unknown) => void): () => void;
  request<T = unknown>(type: string, payload?: unknown, options?: Record<string, unknown>): Promise<T>;
  hasHandler?(type: string): boolean;
  handle?(type: string, handler: (payload: unknown) => MaybePromise<unknown>): () => void;
  listCapabilities?(): MikoEventBusCapability[];
  getCapability?(type: string): MikoEventBusCapability | null;
}

export interface MikoPluginRouteRequestContext {
  pluginId: string;
  agentId: string | null;
  principal: Record<string, unknown> | null;
  capabilityGrant: {
    accessLevel: string;
    declaredPermissions: readonly string[];
    legacyDeclaration: boolean;
  };
  bus: Pick<MikoEventBus, 'request' | 'emit' | 'subscribe' | 'hasHandler' | 'getCapability' | 'listCapabilities'>;
}

export interface MikoPluginHonoLikeContext {
  get?(name: string): unknown;
}

export function getPluginRequestContext(c: MikoPluginHonoLikeContext): MikoPluginRouteRequestContext {
  if (!c || typeof c.get !== 'function') {
    throw new Error('getPluginRequestContext requires a Hono context with c.get(name)');
  }
  const requestContext = c.get('pluginRequestContext');
  if (!requestContext || typeof requestContext !== 'object') {
    throw new Error('getPluginRequestContext must be called inside a Miko plugin route handler');
  }
  const bus = (requestContext as Record<string, unknown>).bus;
  const request = bus && typeof bus === 'object'
    ? (bus as { request?: unknown }).request
    : null;
  if (typeof request !== 'function') {
    throw new Error('getPluginRequestContext found an invalid plugin route request context');
  }
  return requestContext as MikoPluginRouteRequestContext;
}

export interface MikoBusSubscriptionFilter {
  types?: string[] | Set<string>;
  [key: string]: unknown;
}

export interface MikoEventBusCapability {
  type: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  permission: string;
  errors: string[];
  stability: string;
  owner: string;
  since?: string;
  available?: boolean;
}

export interface MikoNormalizedUsage {
  input: {
    totalTokens: number | null;
    uncachedTokens: number | null;
  };
  output: {
    totalTokens: number | null;
    reasoningTokens: number | null;
  };
  cache: {
    readTokens: number | null;
    writeTokens: number | null;
    missTokens: number | null;
    hit: boolean | null;
    created: boolean | null;
    hitRatio: number | null;
    support: 'reported' | 'not_reported' | 'not_supported';
  };
  totalTokens: number | null;
  costTotal: number | null;
}

export type MikoUsageAttribution =
  | { kind: 'session'; agentId: string | null; sessionId?: string | null; sessionPath?: string | null }
  | { kind: 'phone_conversation'; agentId: string; conversationId: string; conversationType: 'channel' | 'dm'; sessionId?: string | null; sessionPath?: string | null }
  | { kind: 'memory'; agentId: string | null }
  | { kind: 'automation'; jobId?: string | null; runId?: string | null; agentId?: string | null }
  | { kind: 'plugin'; pluginId: string; agentId?: string | null; sessionId?: string | null; sessionPath?: string | null }
  | { kind: 'utility'; agentId?: string | null; sessionId?: string | null; sessionPath?: string | null }
  | { kind: 'unknown' };

export interface MikoUsageSource {
  subsystem: 'session' | 'phone' | 'memory' | 'automation' | 'subagent' | 'compaction' | 'plugin' | 'utility' | 'vision' | 'unknown' | string;
  operation: string;
  surface: 'desktop' | 'mobile' | 'bridge' | 'channel' | 'dm' | 'cron' | 'heartbeat' | 'system' | 'plugin' | 'unknown' | string;
  trigger: 'user' | 'manual' | 'threshold' | 'overflow' | 'daily' | 'scheduled' | 'startup' | 'tool' | 'unknown' | string;
  actor?: {
    kind: 'session' | 'phone_conversation' | 'automation' | 'plugin' | 'subagent' | 'unknown' | string;
    agentId?: string | null;
    sessionId?: string | null;
    sessionPath?: string | null;
    taskId?: string | null;
    [key: string]: unknown;
  };
  parent?: {
    kind: 'session' | 'phone_conversation' | 'automation' | 'plugin' | 'unknown' | string;
    sessionId?: string;
    sessionPath?: string;
    conversationId?: string;
    conversationType?: 'channel' | 'dm';
    taskId?: string;
    pluginId?: string;
    [key: string]: unknown;
  };
}

export interface MikoUsageLedgerEntry {
  schemaVersion: 1;
  requestId: string;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
  status: 'ok' | 'error' | 'aborted' | 'usage_missing';
  source: MikoUsageSource;
  attribution: MikoUsageAttribution;
  model: {
    provider: string | null;
    modelId: string | null;
    api: string | null;
  };
  usage: MikoNormalizedUsage | null;
  rawUsageShape: string | null;
  error: {
    name: string | null;
    message: string | null;
  } | null;
}

export interface MikoUsageListFilter {
  since?: string;
  until?: string;
  attributionKind?: string;
  sessionId?: string;
  sessionPath?: string;
  agentId?: string;
  subsystem?: string;
  operation?: string;
  modelId?: string;
  provider?: string;
  status?: 'ok' | 'error' | 'aborted' | 'usage_missing' | string;
  limit?: number;
}

export interface MikoUsageListResult {
  entries: MikoUsageLedgerEntry[];
  nextCursor: string | null;
}

export interface MikoUsageEventMeta {
  sessionId?: string | null;
  sessionPath?: string | null;
  sessionRef?: MikoSessionRef | null;
}

export interface MikoPluginLogger {
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface MikoBusHandlerContext {
  serverId: string;
  serverNodeId?: string;
  userId: string;
  studioId: string;
  connectionKind?: 'local' | 'lan' | 'custom_remote' | 'relay' | 'cloud' | string;
  credentialKind?: 'none' | 'loopback_token' | 'device_credential' | 'user_session' | string;
  platformAccountId?: string | null;
  officialServiceKind?: 'relay' | 'cloud_studio' | 'inference' | 'billing' | string | null;
  executionBoundary?: MikoExecutionBoundary;
  pluginId: string;
  bus: MikoEventBus;
  network?: MikoPluginNetwork;
  resources?: MikoPluginResources;
  config?: MikoPluginConfigStore;
  log?: MikoPluginLogger;
  [key: string]: unknown;
}

export interface MikoBusHandlerDefinition<
  Payload = unknown,
  Result = unknown,
  Context extends MikoBusHandlerContext = MikoBusHandlerContext,
> {
  type: string;
  handle(payload: Payload, ctx: Context): MaybePromise<Result>;
}

export interface MikoPluginContext {
  serverId: string;
  serverNodeId?: string;
  userId: string;
  studioId: string;
  connectionKind?: 'local' | 'lan' | 'custom_remote' | 'relay' | 'cloud' | string;
  credentialKind?: 'none' | 'loopback_token' | 'device_credential' | 'user_session' | string;
  platformAccountId?: string | null;
  officialServiceKind?: 'relay' | 'cloud_studio' | 'inference' | 'billing' | string | null;
  executionBoundary?: MikoExecutionBoundary;
  pluginId: string;
  pluginDir: string;
  dataDir: string;
  capabilities?: string[];
  sensitiveCapabilities?: string[];
  sessionId?: string | null;
  sessionRef?: MikoSessionRef | null;
  /** @deprecated Use sessionId/sessionRef. Kept for legacy plugins. */
  sessionPath?: string | null;
  bus: MikoEventBus;
  network: MikoPluginNetwork;
  resources: MikoPluginResources;
  config: MikoPluginConfigStore;
  log: MikoPluginLogger;
  registerTool?: (tool: MikoToolDefinition) => () => void;
  registerSessionFile?: (input: Record<string, unknown>) => MikoSessionFile;
  stageFile?: (input: Record<string, unknown>) => MikoStagedSessionFile;
  [key: string]: unknown;
}

export type MikoPluginDisposable = () => void;

export interface MikoPluginLifecycleHelpers {
  register(disposable: MikoPluginDisposable): void;
}

export interface MikoPluginLifecycle {
  onload?(ctx: MikoPluginContext, helpers: MikoPluginLifecycleHelpers): MaybePromise<void>;
  onunload?(ctx: MikoPluginContext): MaybePromise<void>;
}

export interface MikoPluginInstance {
  ctx: MikoPluginContext;
  register: (disposable: MikoPluginDisposable) => void;
  onload?(): MaybePromise<void>;
  onunload?(): MaybePromise<void>;
}

export type MikoTaskStatus =
  | 'pending'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'recovering'
  | 'completed'
  | 'failed'
  | 'canceled'
  | 'aborted';

export interface MikoTaskProgress {
  current?: number;
  total?: number;
  percent?: number;
  message?: string;
}

export interface MikoTaskRecord {
  taskId: string;
  type: string;
  parentSessionPath?: string | null;
  pluginId?: string | null;
  agentId?: string | null;
  meta?: Record<string, unknown>;
  progress?: MikoTaskProgress | null;
  status: MikoTaskStatus;
  aborted?: boolean;
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number;
  result?: unknown;
  error?: string;
}

export interface MikoTaskSchedule {
  scheduleId: string;
  type: string;
  pluginId?: string | null;
  agentId?: string | null;
  parentSessionPath?: string | null;
  payload?: unknown;
  meta?: Record<string, unknown>;
  intervalMs?: number | null;
  runAt?: number | string | null;
  enabled?: boolean;
  nextRunAt?: number | null;
  lastRunAt?: number | null;
  lastResult?: unknown;
  lastError?: string | null;
  runCount?: number;
}

export interface MikoTaskRegisterInput {
  taskId: string;
  type: string;
  parentSessionPath?: string | null;
  pluginId?: string | null;
  agentId?: string | null;
  meta?: Record<string, unknown>;
  persist?: boolean;
}

export interface MikoTaskUpdateInput {
  taskId: string;
  status?: MikoTaskStatus;
  progress?: MikoTaskProgress | null;
  meta?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
  parentSessionPath?: string | null;
  pluginId?: string | null;
  agentId?: string | null;
}

export interface MikoTaskScheduleInput {
  scheduleId: string;
  type: string;
  pluginId?: string | null;
  agentId?: string | null;
  parentSessionPath?: string | null;
  payload?: unknown;
  meta?: Record<string, unknown>;
  intervalMs?: number;
  runAt?: number | string | Date;
  enabled?: boolean;
}

const EMPTY_PARAMETERS: JsonSchema = { type: 'object', properties: {} };

export function defineTool<Input = unknown, Output = unknown>(
  definition: MikoToolDefinition<Input, Output>,
): MikoToolDefinition<Input, Output> & { parameters: JsonSchema } {
  return {
    ...definition,
    parameters: definition.parameters ?? EMPTY_PARAMETERS,
  };
}

export function defineCommand<Context = MikoCommandContext>(
  definition: MikoCommandDefinition<Context>,
): MikoCommandDefinition<Context> {
  return { ...definition };
}

export function defineProvider<T extends MikoProviderDefinition>(definition: T): T {
  return definition;
}

export function defineBusHandler<
  Payload = unknown,
  Result = unknown,
  Context extends MikoBusHandlerContext = MikoBusHandlerContext,
>(
  definition: MikoBusHandlerDefinition<Payload, Result, Context>,
): MikoBusHandlerDefinition<Payload, Result, Context> {
  return { ...definition };
}

export function requestBus<Result = unknown, Payload = unknown>(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  type: string,
  payload?: Payload,
  options?: Record<string, unknown>,
): Promise<Result> {
  if (!ctx.bus || typeof ctx.bus.request !== 'function') {
    throw new Error('plugin bus request unavailable');
  }
  return ctx.bus.request<Result>(type, payload, options);
}

function pluginIdFromContext(ctx: { pluginId?: string | null }): string | null {
  return typeof ctx.pluginId === 'string' && ctx.pluginId.length > 0 ? ctx.pluginId : null;
}

function withOwnerPlugin<T extends Record<string, unknown>>(
  ctx: { pluginId?: string | null },
  input: T,
): T {
  const pluginId = pluginIdFromContext(ctx);
  if (!pluginId || input.ownerPluginId) return input;
  return { ...input, ownerPluginId: pluginId };
}

function withContextMetadata(
  ctx: { pluginId?: string | null },
  context: MikoSessionTurnContext | null | undefined,
): MikoSessionTurnContext | null | undefined {
  const pluginId = pluginIdFromContext(ctx);
  if (!pluginId) return context;
  if (!context) {
    return { metadata: { pluginId } };
  }
  return {
    ...context,
    metadata: {
      pluginId,
      ...(context.metadata || {}),
    },
  };
}

function textOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeSessionTarget(target: MikoSessionTarget): Record<string, unknown> {
  if (typeof target === 'string') return { sessionPath: target };
  if (!target || typeof target !== 'object') return { sessionPath: target as unknown };

  const sessionId = textOrNull((target as any).sessionId);
  const sessionPath = textOrNull((target as any).sessionPath) || textOrNull((target as any).path);
  const legacySessionPath = textOrNull((target as any).legacySessionPath);
  if (!sessionId) {
    return sessionPath ? { sessionPath } : {};
  }

  const sessionRef: MikoSessionRef = {
    sessionId,
    ...(sessionPath ? { sessionPath } : {}),
    ...(legacySessionPath ? { legacySessionPath } : {}),
  };
  return {
    sessionId,
    ...(sessionPath ? { sessionPath } : {}),
    ...(legacySessionPath ? { legacySessionPath } : {}),
    sessionRef,
  };
}

function sessionRefFromTarget(target: MikoSessionTarget): MikoSessionRef | null {
  const payload = normalizeSessionTarget(target);
  return (payload.sessionRef as MikoSessionRef | undefined) || null;
}

export function createChatSurfaceCard(
  ctx: { pluginId?: string | null },
  target: MikoSessionTarget,
  options: MikoChatSurfaceCardOptions = {},
): MikoChatSurfaceCardDetails {
  const pluginId = pluginIdFromContext(ctx);
  if (!pluginId) {
    throw new Error('createChatSurfaceCard requires ctx.pluginId');
  }
  const payload = normalizeSessionTarget(target);
  const sessionId = textOrNull(payload.sessionId);
  const sessionPath = textOrNull(payload.sessionPath);
  if (!sessionId) {
    throw new Error('createChatSurfaceCard requires sessionId or sessionRef; sessionPath alone is legacy locator metadata');
  }
  const sessionRef: MikoSessionRef = {
    sessionId,
    ...(sessionPath ? { sessionPath } : {}),
  };
  return {
    type: 'chat.surface',
    pluginId,
    sessionId,
    sessionRef,
    ...(sessionPath ? { sessionPath } : {}),
    ...(options.title ? { title: options.title } : {}),
    description: options.description || 'Plugin private chat session.',
    mode: options.mode || 'transcript',
    ...(options.composer !== undefined ? { composer: options.composer } : {}),
    ...(options.aspectRatio ? { aspectRatio: options.aspectRatio } : {}),
  };
}

export function createSession(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoSessionCreateInput = {},
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'session:create', withOwnerPlugin(ctx, { ...input }), options);
}

export function getSession(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  target: MikoSessionTarget,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'session:get', normalizeSessionTarget(target), options);
}

export function listSessions(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  filter: MikoSessionListFilter = {},
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'session:list', filter, options);
}

export function updateSession(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  target: MikoSessionTarget,
  patch: MikoSessionUpdateInput,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'session:update', {
    ...normalizeSessionTarget(target),
    ...withOwnerPlugin(ctx, { ...patch }),
  }, options);
}

export function sendSessionMessage(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  target: MikoSessionTarget,
  input: MikoSessionSendInput,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'session:send', {
    ...normalizeSessionTarget(target),
    ...input,
    context: withContextMetadata(ctx, input.context),
  }, options);
}

export function subscribeSessionEvents(
  ctx: { bus?: Pick<MikoEventBus, 'subscribe'> | null },
  target: MikoSessionTarget,
  handler: (event: unknown, meta: { sessionId: string | null; sessionPath: string | null; sessionRef: MikoSessionRef | null }) => void,
): () => void {
  if (!ctx.bus || typeof ctx.bus.subscribe !== 'function') {
    throw new Error('plugin bus subscribe unavailable');
  }
  const filter = normalizeSessionTarget(target);
  const targetRef = sessionRefFromTarget(target);
  return ctx.bus.subscribe((event, scopedSessionPath) => {
    const eventSessionId = event && typeof event === 'object' ? textOrNull((event as any).sessionId) : null;
    const sessionId = eventSessionId || targetRef?.sessionId || null;
    const sessionPath = scopedSessionPath || targetRef?.sessionPath || null;
    const sessionRef = sessionId ? {
      sessionId,
      ...(sessionPath ? { sessionPath } : {}),
      ...(targetRef?.legacySessionPath ? { legacySessionPath: targetRef.legacySessionPath } : {}),
    } : null;
    handler(event, { sessionId, sessionPath, sessionRef });
  }, filter);
}

export function listAgents(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  filter: { ownerPluginId?: string; includePluginPrivate?: boolean } = {},
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'agent:list', filter, options);
}

export function getAgentProfile(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  agentId: string,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'agent:profile', { agentId }, options);
}

export function createAgent(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoCreateInput,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'agent:create', withOwnerPlugin(ctx, { ...input }), options);
}

export function updateAgent(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  agentId: string,
  patch: MikoUpdateInput,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'agent:update', { agentId, ...withOwnerPlugin(ctx, { ...patch }) }, options);
}

export function sampleText(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoModelSampleInput,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'model:sample-text', {
    ...input,
    ...(pluginIdFromContext(ctx) ? { pluginId: pluginIdFromContext(ctx) } : {}),
  }, options);
}

export function listMediaProviders(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  filter: MikoMediaProviderFilter = {},
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'provider:media-providers', filter, options);
}

export function resolveMediaModel(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  ref: MikoMediaModelRef,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'provider:resolve-media-model', ref, options);
}

export function generateImage(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoGenerateImageInput,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'media:generate-image', {
    ...input,
    ...(pluginIdFromContext(ctx) ? { pluginId: pluginIdFromContext(ctx) } : {}),
  }, options);
}

export function generateVideo(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoGenerateVideoInput,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'media:generate-video', {
    ...input,
    ...(pluginIdFromContext(ctx) ? { pluginId: pluginIdFromContext(ctx) } : {}),
  }, options);
}

export function generateMedia(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoGenerateMediaInput,
  options?: Record<string, unknown>,
): Promise<unknown> {
  return requestBus(ctx, 'media:generate', {
    ...input,
    ...(pluginIdFromContext(ctx) ? { pluginId: pluginIdFromContext(ctx) } : {}),
  }, options);
}

export function transcribeAudio(
  ctx: { pluginId?: string | null; bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoTranscribeAudioInput,
  options?: Record<string, unknown>,
): Promise<MikoTranscribeAudioResult> {
  return requestBus(ctx, 'media:transcribe-audio', {
    ...input,
    ...(pluginIdFromContext(ctx) ? { pluginId: pluginIdFromContext(ctx) } : {}),
  }, options).then(normalizeTranscribeAudioResult);
}

function normalizeTranscribeAudioResult(result: unknown): MikoTranscribeAudioResult {
  if (result && typeof result === 'object' && (result as any).ok === true
    && Object.prototype.hasOwnProperty.call(result, 'transcription')) {
    return result as MikoTranscribeAudioResult;
  }
  return { ok: true, transcription: result };
}

export function listUsageEntries(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  filter: MikoUsageListFilter = {},
  options?: Record<string, unknown>,
): Promise<MikoUsageListResult> {
  return requestBus<MikoUsageListResult, MikoUsageListFilter>(ctx, 'usage:list', filter, options);
}

export function subscribeUsageEvents(
  ctx: { bus?: Pick<MikoEventBus, 'subscribe'> | null },
  handler: (entry: MikoUsageLedgerEntry, meta: MikoUsageEventMeta) => void,
): () => void {
  if (!ctx.bus || typeof ctx.bus.subscribe !== 'function') {
    throw new Error('plugin bus subscribe unavailable');
  }
  return ctx.bus.subscribe((event, sessionPath) => {
    if (!event || typeof event !== 'object') return;
    const typed = event as { type?: unknown; entry?: unknown };
    if (typed.type !== 'llm_usage') return;
    const entry = typed.entry as MikoUsageLedgerEntry;
    const entrySessionId =
      textOrNull((entry as any)?.attribution?.sessionId)
      || textOrNull((entry as any)?.source?.actor?.sessionId)
      || textOrNull((entry as any)?.source?.parent?.sessionId);
    const entrySessionPath =
      textOrNull((entry as any)?.attribution?.sessionPath)
      || textOrNull((entry as any)?.source?.actor?.sessionPath)
      || textOrNull((entry as any)?.source?.parent?.sessionPath)
      || textOrNull(sessionPath);
    handler(entry, {
      ...(entrySessionId ? { sessionId: entrySessionId } : {}),
      sessionPath: entrySessionPath,
      ...(entrySessionId ? {
        sessionRef: {
          sessionId: entrySessionId,
          ...(entrySessionPath ? { sessionPath: entrySessionPath } : {}),
        },
      } : {}),
    });
  }, { types: ['llm_usage'] });
}

export function registerTask(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoTaskRegisterInput,
): Promise<{ ok: true }> {
  return requestBus(ctx, 'task:register', input);
}

export function updateTask(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoTaskUpdateInput,
): Promise<{ ok: true; task: MikoTaskRecord }> {
  return requestBus(ctx, 'task:update', input);
}

export function completeTask(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  taskId: string,
  result?: unknown,
): Promise<{ ok: true; task: MikoTaskRecord }> {
  return requestBus(ctx, 'task:complete', { taskId, result });
}

export function failTask(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  taskId: string,
  error: unknown,
): Promise<{ ok: true; task: MikoTaskRecord }> {
  return requestBus(ctx, 'task:fail', { taskId, error });
}

export function cancelTask(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  taskId: string,
  reason?: string,
): Promise<{ result: string; canceled: boolean }> {
  return requestBus(ctx, 'task:cancel', { taskId, reason });
}

export function scheduleTask(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  input: MikoTaskScheduleInput,
): Promise<{ ok: true; schedule: MikoTaskSchedule }> {
  return requestBus(ctx, 'task:schedule', input);
}

export function unscheduleTask(
  ctx: { bus?: Pick<MikoEventBus, 'request'> | null },
  scheduleId: string,
): Promise<{ ok: true; removed: boolean }> {
  return requestBus(ctx, 'task:unschedule', { scheduleId });
}

export function sessionFileToMediaItem(file: MikoSessionFile): MikoSessionFileMediaItem {
  const fileId = firstText(file.fileId, file.id);
  if (!fileId) {
    throw new Error('SessionFile media item requires id or fileId');
  }

  const item: MikoSessionFileMediaItem = {
    type: 'session_file',
    fileId,
  };
  assignDefined(item, 'sessionId', file.sessionId);
  assignDefined(item, 'sessionPath', file.sessionPath);
  assignDefined(item, 'filePath', file.filePath);
  assignDefined(item, 'label', firstText(file.label, file.displayName, file.filename));
  assignDefined(item, 'mime', file.mime);
  assignDefined(item, 'size', file.size);
  assignDefined(item, 'kind', file.kind);
  return item;
}

type MikoMediaInput = MikoSessionFile | MikoSessionFileMediaItem | MikoStagedSessionFile;

export function createMediaDetails(items: MikoMediaInput[]): MikoMediaDetails {
  return {
    media: {
      items: items.map(normalizeMediaItem),
    },
  };
}

export function defineExtension<Pi = unknown>(factory: MikoExtensionFactory<Pi>): MikoExtensionFactory<Pi> {
  return factory;
}

export function definePlugin(lifecycle: MikoPluginLifecycle): new () => MikoPluginInstance {
  return class DefinedMikoPlugin implements MikoPluginInstance {
    ctx!: MikoPluginContext;
    register!: (disposable: MikoPluginDisposable) => void;

    async onload(): Promise<void> {
      await lifecycle.onload?.(this.ctx, { register: this.register });
    }

    async onunload(): Promise<void> {
      await lifecycle.onunload?.(this.ctx);
    }
  };
}

function normalizeMediaItem(input: MikoMediaInput): MikoSessionFileMediaItem {
  if (isRecord(input) && isRecord(input.mediaItem)) {
    return normalizeSessionFileMediaItem(input.mediaItem);
  }
  if (isRecord(input) && input.type === 'session_file') {
    return normalizeSessionFileMediaItem(input);
  }
  if (isRecord(input)) {
    return sessionFileToMediaItem(input);
  }
  throw new Error('media details item must be a SessionFile, staged file, or session_file media item');
}

function normalizeSessionFileMediaItem(input: Record<string, unknown>): MikoSessionFileMediaItem {
  if (input.type !== 'session_file') {
    throw new Error('media details item must be a session_file media item');
  }
  const fileId = firstText(input.fileId);
  if (!fileId) {
    throw new Error('SessionFile media item requires fileId');
  }
  return {
    ...input,
    type: 'session_file',
    fileId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

function assignDefined(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== undefined && value !== null) {
    target[key] = value;
  }
}
