import { ModelRouterEmbeddingModel } from "@mastra/core/llm";
import { Memory } from "@mastra/memory";
import { PgVector, PostgresStore } from "@mastra/pg";
import { MODEL_CATALOG } from "./models";

type EmbeddingInputType = "query" | "passage";

type EmbedValuesInput = {
  values: string[];
  inputType?: EmbeddingInputType;
  dimensions?: number;
  user?: string;
};

type EmbedValuesResult = {
  provider: string;
  modelId: string;
  embeddings: number[][];
};

export class EmbeddingHttpError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "EmbeddingHttpError";
    this.status = status;
    this.details = details;
  }
}
type StorageBundle = {
  storage: PostgresStore;
  embedder: ModelRouterEmbeddingModel;
  documentVectorStore: PgVector;
  companionMemory: Memory;
};

let _bundle: StorageBundle | null = null;
let _initPromise: Promise<StorageBundle> | null = null;

export async function getStorage(): Promise<StorageBundle> {
  if (_bundle) return _bundle;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const skipInit =
      process.env.SKIP_MASTRA_INIT === "true" ||
      (typeof process.env.NEXT_PHASE === "string" && process.env.NEXT_PHASE.includes("build"));

    if (skipInit) {
      throw new Error("Storage skipped during build phase");
    }

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "[simple-agent.memory] DATABASE_URL environment variable is not set. Set it before starting the server."
      );
    }

    const storage = new PostgresStore({
      id: "companion-storage",
      connectionString,
    });

    const embedder = new ModelRouterEmbeddingModel({
      providerId: "nvidia",
      modelId: "nvidia/llama-3.2-nemoretriever-300m-embed-v1",
      url: "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_API_KEY_EMBED,
    });

    const documentVectorStore = new PgVector({
      id: "document-rag-vector",
      connectionString,
    });

    const companionMemory = new Memory({
      storage,
      vector: new PgVector({
        id: "companion-vector",
        connectionString,
      }),
      embedder,
      options: {
        lastMessages: 20,
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
          model: MODEL_CATALOG.nvidiaKimiK2,
        },
      },
    });

    _bundle = { storage, embedder, documentVectorStore, companionMemory };
    return _bundle;
  })();

  return _initPromise;
}

function sanitizeEmbeddingValues(values: string[]): string[] {
  return values
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
}

async function embedWithNvidia(input: EmbedValuesInput & { modelId?: string }): Promise<EmbedValuesResult> {
  const apiKey = process.env.NVIDIA_API_KEY_EMBED;
  if (!apiKey) {
    throw new Error("nvidia_api_key_missing");
  }

  const response = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.modelId,
      input: input.values,
      input_type: input.inputType ?? "passage",
      encoding_format: "float",
      dimensions: input.dimensions,
      user: input.user,
    }),
  });

  const data = (await response.json().catch(() => null)) as
    | {
        data?: Array<{ embedding: number[] }>;
        error?: unknown;
      }
    | null;

  if (!response.ok) {
    throw new EmbeddingHttpError(
      `NVIDIA embeddings request failed (${response.status})`,
      response.status,
      data?.error ?? data
    );
  }

  const embeddings = data?.data?.map((item) => item.embedding) ?? [];

  return {
    provider: "nvidia",
    modelId: input.modelId ?? "",
    embeddings,
  };
}

export async function embedValues(input: EmbedValuesInput): Promise<EmbedValuesResult> {
  const values = sanitizeEmbeddingValues(input.values);
  if (values.length === 0) {
    throw new Error("embedding_input_empty");
  }

  const bundle = await getStorage();
  const embedderInstance = bundle.embedder;

  if (embedderInstance.provider === "nvidia") {
    return embedWithNvidia({ ...input, values, modelId: embedderInstance.modelId });
  }

  let providerOptions:
    | { "openai-compatible": Record<string, number | string> }
    | undefined;

  if (input.dimensions !== undefined || input.user !== undefined) {
    const openAiCompatible: Record<string, number | string> = {};

    if (input.dimensions !== undefined) {
      openAiCompatible.dimensions = input.dimensions;
    }

    if (input.user !== undefined) {
      openAiCompatible.user = input.user;
    }

    providerOptions = { "openai-compatible": openAiCompatible };
  }

  const result = await embedderInstance.doEmbed({
    values,
    providerOptions,
  });

  return {
    provider: embedderInstance.provider,
    modelId: embedderInstance.modelId,
    embeddings: result.embeddings,
  };
}
function createAsyncProxy<T>(getter: () => Promise<T>): T {
  return new Proxy(
    {},
    {
      get(_target, prop: string) {
        return (...args: unknown[]) =>
          getter().then((real) => {
            const val = (real as any)[prop];
            if (typeof val === "function") {
              return val.apply(real, args);
            }
            return val;
          });
      },
    }
  ) as unknown as T;
}

export const storage = createAsyncProxy<PostgresStore>(async () => (await getStorage()).storage);
export const documentVectorStore = createAsyncProxy<PgVector>(async () => (await getStorage()).documentVectorStore);
export const companionMemory = createAsyncProxy<Memory>(async () => (await getStorage()).companionMemory);
