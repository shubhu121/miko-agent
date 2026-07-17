


export function wsSend(ws, msg) {
  if (ws.readyState === 1) { // OPEN
    ws.send(JSON.stringify(msg));
  }
}


export function wsSendSerialized(ws, payload) {
  if (ws.readyState === 1) { // OPEN
    ws.send(payload);
  }
}


export function wsParse(data) {
  try {
    const str = typeof data === "string" ? data : (data?.toString?.() ?? String(data));
    return JSON.parse(str);
  } catch {
    return null;
  }
}


export function createSessionStreamEventWsMessage(input) {
  const context = "Invalid WebSocket session stream event";
  const payload = assertObject(input, "input", context);
  const sessionPath = assertNonEmptyString(payload.sessionPath, "sessionPath", context);
  const sessionEvent = assertSessionEventPayload(payload.sessionEvent, "sessionEvent", context);
  const sessionId = optionalNonEmptyString(
    Object.prototype.hasOwnProperty.call(payload, "sessionId")
      ? payload.sessionId
      : sessionEvent.sessionId,
    "sessionId",
    context,
  );
  const streamId = assertNonEmptyString(payload.streamId, "streamId", context);
  const seq = assertPositiveInteger(payload.seq, "seq", context);

  assertCompatibleField(sessionEvent, "sessionPath", sessionPath, context);
  if (sessionId) assertCompatibleField(sessionEvent, "sessionId", sessionId, context);
  assertCompatibleField(sessionEvent, "sessionRefVersion", 2, context);
  assertCompatibleField(sessionEvent, "streamId", streamId, context);
  assertCompatibleField(sessionEvent, "seq", seq, context);

  return {
    ...sessionEvent,
    sessionPath,
    ...(sessionId ? { sessionId } : {}),
    sessionRefVersion: 2,
    streamId,
    seq,
  };
}


export function createStreamResumeWsMessage(input) {
  const context = "Invalid WebSocket stream_resume message";
  const payload = assertObject(input, "input", context);
  const sessionPath = assertNonEmptyString(payload.sessionPath, "sessionPath", context);
  const sessionId = optionalNonEmptyString(payload.sessionId, "sessionId", context);
  const streamId = assertNullableNonEmptyString(payload.streamId, "streamId", context);
  const sinceSeq = assertNonNegativeInteger(payload.sinceSeq, "sinceSeq", context);
  const nextSeq = assertPositiveInteger(payload.nextSeq, "nextSeq", context);
  const reset = assertBoolean(payload.reset, "reset", context);
  const truncated = assertBoolean(payload.truncated, "truncated", context);
  const isStreaming = assertBoolean(payload.isStreaming, "isStreaming", context);
  const events = assertReplayEvents(payload.events, context);

  const message: Record<string, unknown> = {
    type: "stream_resume",
    sessionPath,
    ...(sessionId ? { sessionId, sessionRefVersion: 2 } : {}),
    streamId,
    sinceSeq,
    nextSeq,
    reset,
    truncated,
    isStreaming,
    events,
  };

  if (Object.prototype.hasOwnProperty.call(payload, "runtimeIsStreaming")) {
    message.runtimeIsStreaming = assertBoolean(payload.runtimeIsStreaming, "runtimeIsStreaming", context);
  }

  return message;
}

function assertReplayEvents(events, context) {
  if (!Array.isArray(events)) {
    throw new TypeError(`${context}: events must be an array`);
  }
  for (let index = 0; index < events.length; index += 1) {
    const entry = assertObject(events[index], `events[${index}]`, context);
    assertPositiveInteger(entry.seq, `events[${index}].seq`, context);
    if (Object.prototype.hasOwnProperty.call(entry, "ts") && !Number.isFinite(entry.ts)) {
      throw new TypeError(`${context}: events[${index}].ts must be a finite number`);
    }
    assertSessionEventPayload(entry.event, `events[${index}].event`, context);
  }
  return events;
}

function assertSessionEventPayload(value, field, context) {
  const event = assertObject(value, field, context);
  assertNonEmptyString(event.type, `${field}.type`, context);
  return event;
}

function assertCompatibleField(value, field, expected, context) {
  if (!Object.prototype.hasOwnProperty.call(value, field)) return;
  const actual = value[field];
  if (actual === undefined || actual === null) return;
  if (actual !== expected) {
    throw new TypeError(`${context}: sessionEvent.${field} conflicts with top-level ${field}`);
  }
}

function assertObject(value, field, context) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${context}: ${field} must be an object`);
  }
  return value;
}

function assertNonEmptyString(value, field, context) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${context}: ${field} must be a non-empty string`);
  }
  return value;
}

function assertNullableNonEmptyString(value, field, context) {
  if (value === null) return null;
  return assertNonEmptyString(value, field, context);
}

function optionalNonEmptyString(value, field, context) {
  if (value === undefined || value === null) return null;
  return assertNonEmptyString(value, field, context);
}

function assertPositiveInteger(value, field, context) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${context}: ${field} must be a positive integer`);
  }
  return value;
}

function assertNonNegativeInteger(value, field, context) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${context}: ${field} must be a non-negative integer`);
  }
  return value;
}

function assertBoolean(value, field, context) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${context}: ${field} must be a boolean`);
  }
  return value;
}
