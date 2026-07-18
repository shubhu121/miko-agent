

import type { FileVersion } from '../types';
import type { ThinkingLevel } from './model-slice';



export interface ToolCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  done: boolean;
  success: boolean;
  details?: { card?: import('../types').PluginCardDetails; [key: string]: unknown };
}



export interface UserAttachment {
  fileId?: string;
  path: string;
  name: string;
  isDir: boolean;
  base64Data?: string;
  mimeType?: string;
  presentation?: 'attachment' | 'voice-input' | string;
  listed?: boolean;
  status?: 'available' | 'expired' | string;
  missingAt?: number | null;
  visionAuxiliary?: boolean;
  transcription?: VoiceTranscription;
  waveform?: AudioWaveform;
}

export interface AudioWaveform {
  version: 1;
  peaks: number[];
  durationMs?: number;
  source?: 'computed' | 'fallback';
}

export interface VoiceTranscription {
  status: 'pending' | 'ready' | 'failed';
  text?: string;
  providerId?: string;
  modelId?: string;
  protocolId?: string;
  language?: string;
  durationMs?: number;
  error?: string;
  createdAt?: number;
  updatedAt?: number;
}

export interface AgentReviewContext {
  requestId?: string | null;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  reviewedSessionId?: string | null;
  reviewerSessionId?: string | null;
  reviewerAgentId: string;
  reviewerAgentName: string;
  text?: string | null;
  error?: string | null;
  completedAt?: string | null;
}

export interface AgentReviewRequestContext {
  requestId?: string | null;
  reviewedSessionId: string;
  reviewerAgentId: string;
  reviewerAgentName: string;
}

export interface DeskContext {
  dir: string;
  fileCount: number;
}

export interface SessionRegistryFile {
  id?: string;
  fileId?: string;
  sessionPath?: string;
  filePath?: string;
  realPath?: string;
  label?: string;
  displayName?: string;
  filename?: string;
  ext?: string;
  mime?: string;
  kind?: string;
  storageKind?: string;
  presentation?: 'attachment' | 'voice-input' | string;
  listed?: boolean;
  status?: 'available' | 'expired' | string;
  missingAt?: number | null;
  origin?: string;
  operations?: string[];
  createdAt?: number;
  mtimeMs?: number;
  size?: number | null;
  version?: FileVersion | null;
  isDirectory?: boolean;
  resource?: ResourceEnvelope;
  transcription?: VoiceTranscription;
  waveform?: AudioWaveform;
}

export interface ResourceEnvelope {
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
    status: 'available' | 'expired' | string;
    missingAt: number | string | null;
  };
  storage: {
    provider: 'session_file' | string;
    storageKind?: string;
    localOnly?: boolean;
  };
  links: {
    self: string;
    content?: string;
  };
}



export interface SessionConfirmationBlock {
  type: 'session_confirmation';
  confirmId: string;
  kind: string;
  surface: 'input' | 'message';
  status: 'pending' | 'confirmed' | 'rejected' | 'timeout' | 'aborted';
  title: string;
  body?: string;
  subject?: {
    label: string;
    detail?: string;
  };
  severity?: 'normal' | 'elevated' | 'danger';
  actions?: {
    confirmLabel?: string;
    rejectLabel?: string;
  };
  payload?: Record<string, unknown>;
}

export interface SettingsUpdateChange {
  key: string;
  label: string;
  before: string;
  after: string;
  sensitive?: boolean;
}

export interface SettingsUpdatePayload {
  status: 'applied' | 'failed' | 'skipped' | 'needs_action' | string;
  action: string;
  key: string;
  title: string;
  summary: string;
  target?: {
    type?: string;
    id?: string | null;
    label?: string | null;
  };
  changes?: SettingsUpdateChange[];
}

export interface SuggestionCardBlock {
  type: 'suggestion_card';
  kind: 'automation_draft' | string;
  confirmId?: string;
  suggestionId?: string;
  suggestionShortCode?: string;
  operation?: 'create' | 'update' | string;
  status: 'pending' | 'approved' | 'rejected' | string;
  title: string;
  description?: string;
  target?: {
    type?: string;
    id?: string | null;
    label?: string | null;
  };
  detail?: {
    kind?: string;
    operation?: 'create' | 'update' | string;
    jobData?: Record<string, unknown>;
    [key: string]: unknown;
  };
  actions?: Array<{
    id?: string;
    kind?: string;
    label?: string;
  }>;
}


export type TextDecorator =
  | { type: 'thinking'; content: string; sealed: boolean }
  | { type: 'mood'; yuan: string; text: string }
  | { type: 'tool_group'; tools: ToolCall[]; collapsed: boolean }
  | { type: 'text'; html: string; source?: string };


export type RichBlock =
  | { type: 'file'; fileId?: string; filePath: string; label: string; ext: string; mime?: string; kind?: string; storageKind?: string; presentation?: 'attachment' | 'voice-input' | string; listed?: boolean; status?: 'available' | 'expired' | string; missingAt?: number | null; resource?: ResourceEnvelope; mtimeMs?: number; size?: number | null; version?: FileVersion | null; waveform?: AudioWaveform; replacesTaskId?: string }
  | { type: 'media_generation'; taskId: string; kind: 'image' | 'video' | string; status: 'pending' | 'failed' | 'aborted' | string; prompt?: string; batchId?: string; reason?: string }
  // COMPAT(create_artifact, remove no earlier than v0.133 after legacy sessions are migrated)
  | { type: 'artifact'; artifactId: string; artifactType: string; title: string; content: string; language?: string | null; fileId?: string; filePath?: string; label?: string; ext?: string; mime?: string; kind?: string; storageKind?: string; presentation?: 'attachment' | 'voice-input' | string; listed?: boolean; status?: 'available' | 'expired' | string; missingAt?: number | null; resource?: ResourceEnvelope; mtimeMs?: number; size?: number | null; version?: FileVersion | null }
  | { type: 'screenshot'; base64: string; mimeType: string }
  | { type: 'skill'; skillName: string; skillFilePath: string; fileId?: string; installedFile?: Record<string, unknown>; installedSkillSource?: Record<string, unknown> }
  | { type: 'cron_confirm'; confirmId?: string; jobData: Record<string, unknown>; status: 'pending' | 'approved' | 'rejected' }
  | SuggestionCardBlock
  | { type: 'settings_confirm'; confirmId?: string; settingKey: string; cardType: 'toggle' | 'list' | 'text'; currentValue: string; proposedValue: string; options?: string[]; optionLabels?: Record<string, string>; label: string; description?: string; frontend?: boolean; status: 'pending' | 'confirmed' | 'rejected' | 'timeout' }
  | { type: 'settings_update'; update: SettingsUpdatePayload }
  | SessionConfirmationBlock
  | {
    type: 'interlude';
    id: string;
    deliveryId?: string;
    variant: 'deferred_result' | string;
    timelinePlacement?: 'after_anchor_message' | string;
    taskId?: string;
    status?: 'success' | 'failed' | 'aborted' | string;
    sourceKind?: 'subagent' | 'workflow' | 'tool' | string;
    sourceLabel?: string;
    previewSessionId?: string;
    previewSessionPath?: string;
    previewAgentId?: string;
    text: string;
    detailMarkdown?: string;
  }
  | {
    type: 'subagent';
    taskId: string;
    task: string;
    taskTitle: string;
    agentId?: string;
    agentName?: string;
    requestedAgentId?: string;
    requestedAgentName?: string;
    executorAgentId?: string;
    executorAgentNameSnapshot?: string;
    sessionId?: string | null;
    streamKey: string;
    streamStatus: 'running' | 'done' | 'failed' | 'aborted';
    summary?: string;
    label?: string | null;
    reuseInstance?: string | null;
  }
  | {
    
    type: 'workflow';
    taskId: string;
    taskTitle: string;
    streamStatus: 'running' | 'done' | 'failed' | 'aborted';
    summary?: string;
    startedAt?: number | null;
    finishedAt?: number | null;
  }
  | { type: 'plugin_card'; card: import('../types').PluginCardDetails }
  | { type: 'interactive_card'; cardId: string; title: string; code: string };

export type ContentBlock = TextDecorator | RichBlock;



export interface ChatMessage {
  id: string;              
  sourceEntryId?: string;  
  role: 'user' | 'assistant';
  // User
  text?: string;
  textHtml?: string;
  quotedText?: string;
  attachments?: UserAttachment[];
  deskContext?: DeskContext | null;
  skills?: string[];
  sessionRefs?: Array<{ sessionId: string; label: string }>;
  agentMentions?: Array<{ agentId: string; label: string }>;
  agentReview?: AgentReviewContext;
  agentReviewRequest?: AgentReviewRequestContext;
  sendStatus?: 'pending' | 'failed';
  sendError?: string;
  
  origin?: { kind: 'agent'; agentId: string | null; agentName: string | null };
  // Assistant
  blocks?: ContentBlock[];
  
  timestamp?: number;
}



export type ChatListItem =
  | { type: 'message'; data: ChatMessage }
  | { type: 'interlude'; id: string; data: Extract<ContentBlock, { type: 'interlude' }> }
  | { type: 'compaction'; id: string; yuan: string };






export interface SessionModel {
  id: string;
  name: string;
  provider: string;
  
  input?: ("text" | "image" | "video" | "audio")[];
  video?: boolean;
  videoTransport?: string | null;
  videoTransportSupported?: boolean;
  audio?: boolean;
  audioTransport?: string | null;
  audioTransportSupported?: boolean;
  reasoning?: boolean;
  xhigh?: boolean;
  thinkingLevels?: ThinkingLevel[];
  defaultThinkingLevel?: ThinkingLevel;
  contextWindow?: number;
}





export interface SessionMessages {
  items: ChatListItem[];
  hasMore: boolean;
  loadingMore: boolean;
  oldestId?: string;
  
  revision?: string | null;
}



export interface StreamBuffer {
  sessionPath: string;
  textAcc: string;
  thinkingAcc: string;
  moodAcc: string;
  moodYuan: string;
  inThinking: boolean;
  inMood: boolean;
  lastFlushTime: number;
}
