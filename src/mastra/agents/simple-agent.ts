import { Agent } from "@mastra/core/agent";
import { companionMemory } from "../storage";
import { MODEL_CATALOG } from "../models";

export const simpleAgent = new Agent({
  id: "simple-agent",
  name: "Simple Agent",
  instructions: "You are a helpful assistant. Keep responses concise.",
  model: MODEL_CATALOG.nvidiaKimiK2,
  memory: companionMemory,
});
