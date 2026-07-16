

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

function isToolResultMessage(message) {
  return Boolean(message) && typeof message === "object" && message.role === "tool";
}

function isAssistantMessage(message) {
  return Boolean(message) && typeof message === "object" && message.role === "assistant";
}


function collectToolCallIds(assistant, into) {
  const toolCalls = assistant.tool_calls;
  if (!Array.isArray(toolCalls)) return;
  for (const call of toolCalls) {
    if (call && typeof call === "object" && typeof call.id === "string" && call.id.length > 0) {
      into.add(call.id);
    }
  }
}


export function stripOrphanToolResults(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  
  const declaredToolCallIds = new Set();
  let hasOrphan = false;
  for (const message of messages) {
    if (isAssistantMessage(message)) {
      collectToolCallIds(message, declaredToolCallIds);
      continue;
    }
    if (isToolResultMessage(message)) {
      const id = hasOwn(message, "tool_call_id") ? message.tool_call_id : undefined;
      if (typeof id !== "string" || !declaredToolCallIds.has(id)) {
        hasOrphan = true;
        break;
      }
    }
  }

  if (!hasOrphan) return messages;

  
  declaredToolCallIds.clear();
  const result = [];
  for (const message of messages) {
    if (isAssistantMessage(message)) {
      collectToolCallIds(message, declaredToolCallIds);
      result.push(message);
      continue;
    }
    if (isToolResultMessage(message)) {
      const id = hasOwn(message, "tool_call_id") ? message.tool_call_id : undefined;
      if (typeof id === "string" && declaredToolCallIds.has(id)) {
        result.push(message);
      }
      
      continue;
    }
    result.push(message);
  }

  return result;
}
