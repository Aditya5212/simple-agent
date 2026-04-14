import { Agent } from "@mastra/core/agent";
import { companionMemory } from "../storage";
import { MODEL_CATALOG, type ModelConfig } from "../models";
import { similaritySearchDocumentsTool } from "../tools/document-similarity-search";

type SimpleAgentConfig = {
  id: string;
  name: string;
  model: ModelConfig;
};

export function createSimpleAgent(config: SimpleAgentConfig) {
  return new Agent({
    id: config.id,
    name: config.name,
    instructions:
      "You are a helpful assistant. Keep responses concise. When users ask to search uploaded documents or find relevant passages, use the similaritySearchDocuments tool. Do not ask the user for userId or sessionId; those are provided by server context.",
    model: config.model,
    memory: companionMemory,
    tools: {
      similaritySearchDocuments: similaritySearchDocumentsTool,
    },
  });
}

export const simpleAgent = createSimpleAgent({
  id: "simple-agent",
  name: "Simple Agent",
  model: MODEL_CATALOG.nvidiaKimiK2,
});
