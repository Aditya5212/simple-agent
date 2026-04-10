import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { Memory } from "@mastra/memory";
import { PgVector, PostgresStore } from "@mastra/pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "[simple-agent.memory] DATABASE_URL environment variable is not set. Set it before starting the server."
  );
}

export const storage = new PostgresStore({
  id: "companion-storage",
  connectionString,
});

export const embedder = new ModelRouterEmbeddingModel({
  providerId: "nvidia",
  modelId: "nvidia/llama-3.2-nemoretriever-300m-embed-v1",
  url: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY_EMBED,
});

export const companionMemory = new Memory({
  storage,
  vector: new PgVector({
    id: "companion-vector",
    connectionString,
  }),
  embedder,
  options: {
    lastMessages: 20,
    /*
    semanticRecall: {
      topK: 3,
      messageRange: 2,
      scope: "thread",
      indexConfig: {
        type: "hnsw",
        metric: "cosine",
        hnsw: { m: 16, efConstruction: 64 },
      },
    },
    */
    workingMemory: {
      enabled: true,
      scope: "resource",
      template: `# User Profile

## Basic Info
- **Name**:
- **Role / What they work on**:
- **Location**:
- **Looking for** (co-founder / collaborator / mentor / friends / exploring):
- **Skills**:
- **Availability** (full-time / part-time / weekends / open):

## Personality Signals
- **Work style** (structured / fluid / hybrid):
- **Recharge type** (social / solo / mixed):
- **Communication style** (terse / expressive / async / sync):
- **Energy type** (builder / connector / thinker / explorer):
- **Strengths in collaboration**:
- **Productivity killers**:

## Goals & Context
- **Current goal**:
- **Learning / exploring**:
- **Emotional state / recent update**:
- **Other notes**:
`,
    },
    generateTitle: {
      model: "google/gemini-3.1-flash-lite-preview",
    },
  },
});
