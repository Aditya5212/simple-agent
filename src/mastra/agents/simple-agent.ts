import { Agent } from "@mastra/core/agent";
import { companionMemory } from "../storage";
import { MODEL_CATALOG } from "../models";
import { similaritySearchDocumentsTool } from "../tools/document-similarity-search";

export const simpleAgent = new Agent({
  id: "simple-agent",
  name: "Simple Agent",
  instructions:
    "You are a helpful assistant. Keep responses concise. When users ask to search uploaded documents or find relevant passages, use the similaritySearchDocuments tool. Do not ask the user for userId or sessionId; those are provided by server context.",
  model: MODEL_CATALOG.nvidiaKimiK2,
  memory: companionMemory,
  tools: {
    similaritySearchDocuments: similaritySearchDocumentsTool,
  },
});
