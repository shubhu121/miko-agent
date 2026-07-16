

import { Type } from "../pi-sdk/index.ts";
import { t } from "../i18n.ts";
import fs from "fs";
import path from "path";
import { appendMessage } from "../channels/channel-store.ts";
import { resolveAgentParam } from "./agent-id-resolver.ts";


function ensureDmFile(dmDir, peerId) {
  fs.mkdirSync(dmDir, { recursive: true });
  const filePath = path.join(dmDir, `${peerId}.md`);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `---\npeer: ${peerId}\n---\n`, "utf-8");
  }
  return filePath;
}


export function createDmTool({ agentId, agentsDir, listAgents, onDmSent, isEnabled }) {
  return {
    name: "dm",
    label: "Direct Message",
    description: "Send a single direct message to another agent to inform them of something.\nDo not use this tool to assign tasks or get results; that is subagent's job.",
    parameters: Type.Object({
      to: Type.String({ description: "Target agent's id field value (the one in parentheses in the team roster, not the bold display name)" }),
      message: Type.String({ description: "Message content" }),
    }),

    execute: async (_toolCallId, params) => {
      if (isEnabled && !isEnabled()) {
        return {
          content: [{ type: "text", text: t("error.channelsDisabled") }],
          details: { action: "dm", error: "phone disabled" },
        };
      }

      const agents = listAgents();
      
      const resolved = resolveAgentParam(agents, params.to);
      if (!resolved.ok) {
        const candidates = resolved.ambiguous
          ? resolved.byName
          : agents.filter(a => a.id !== agentId);
        const lines = candidates.map(a => {
          const label = a.name && a.name !== a.id ? `${a.id} (${a.name})` : a.id;
          const parts = [label];
          if (a.model) parts.push(`[${a.model}]`);
          if (a.summary) parts.push(a.summary);
          return parts.join(" — ");
        });
        return {
          content: [{ type: "text", text: t("error.agentNotFoundAvailable", { id: params.to, ids: lines.join("\n") || "(none)" }) }],
        };
      }
      const toId = resolved.agentId;
      if (toId === agentId) {
        return { content: [{ type: "text", text: t("error.cannotSelfDm") }] };
      }
      const target = agents.find(a => a.id === toId);

      
      const myDmDir = path.join(agentsDir, agentId, "dm");
      const myDmFile = ensureDmFile(myDmDir, toId);
      await appendMessage(myDmFile, agentId, params.message);

      
      const peerDmDir = path.join(agentsDir, toId, "dm");
      const peerDmFile = ensureDmFile(peerDmDir, agentId);
      await appendMessage(peerDmFile, agentId, params.message);

      
      if (onDmSent) {
        try { onDmSent(agentId, toId); } catch {}
      }

      return {
        content: [{ type: "text", text: t("error.dmSent", { name: target.name }) }],
        details: { from: agentId, to: toId },
      };
    },
  };
}
