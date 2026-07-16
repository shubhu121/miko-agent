import { SlashCommandRegistry } from "../slash-command-registry.ts";
import { SlashCommandDispatcher } from "../slash-command-dispatcher.ts";
import { createSessionOps } from "./session-ops.ts";
import { bridgeCommands } from "./bridge-commands.ts";
import { RcStateStore } from "./rc-state.ts";













export function createSlashSystem({ engine, hub }) {
  const registry = new SlashCommandRegistry();
  const sessionOps = createSessionOps({ engine });
  
  const rcState = new RcStateStore();
  const dispatcher = new SlashCommandDispatcher({ registry, engine, hub, sessionOps });
  for (const def of bridgeCommands) registry.registerCommand(def);
  return { registry, dispatcher, sessionOps, rcState };
}
