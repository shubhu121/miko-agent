
export function createStructuredOutputTool(schema) {
  let captured;
  const tool = {
    name: "structured_output",
    label: "Structured Output",
    description: "This feature is available in English only.",
    parameters: schema && typeof schema === "object" ? schema : { type: "object" },
    execute: async (_toolCallId, params) => {
      captured = params;
      return { content: [{ type: "text", text: "This feature is available in English only." }] };
    },
  };
  return {
    tool,
    getResult() { return captured; },
  };
}
