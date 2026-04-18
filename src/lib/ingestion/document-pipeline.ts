import { randomUUID } from "node:crypto";
import { MDocument } from "@mastra/rag";
import {
  createLlamaParseJobFromSourceUrl,
  getLlamaParseDefaults,
  getLlamaParseJob,
  LlamaParseHttpError,
  type LlamaParseCreateJobResult,
} from "@/lib/llama-parse";
import { getR2SignedGetUrl } from "@/lib/cloudflare-r2";
import { prisma } from "@/lib/prisma";
import { documentVectorStore, embedValues } from "@/mastra/storage";

type JsonObject = Record<string, unknown>;

type PipelineTrigger = "upload-auto" | "testing-route" | "manual";

type RunPipelineInput = {
  documentId: string;
  userId: string;
  ingestionJobId?: string;
  trigger: PipelineTrigger;
  onPhaseChange?: (phase: string, pct: number) => Promise<void> | void;
};

type ChunkRecord = {
  chunkIndex: number;
  content: string;
  tokenCount: number;
  startIndex: number | null;
};

type ParsedContentFormat = "markdown" | "text";

type ParsedContent = {
  content: string;
  format: ParsedContentFormat;
  source: string;
};

type ChunkingResult = {
  chunks: ChunkRecord[];
  strategy: "markdown" | "recursive";
  format: ParsedContentFormat;
};

type RetrieveDocumentContextInput = {
  userId: string;
  query: string;
  topK?: number;
  sessionId?: string;
  documentIds?: string[];
};

type RetrievalFilter = {
  userId: string;
  sessionId?: string;
  documentId?: { $in: string[] };
};

const DEFAULT_CHUNK_SIZE = 1200;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_TOP_K = 6;
const DEFAULT_MIN_SCORE = 0.35;
const DEFAULT_POLL_ATTEMPTS = 25;
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_VECTOR_INDEX_NAME = "uploaded_document_chunks";
const MAX_VECTOR_INDEX_DIMENSION = 2000;
const MAX_HALFVEC_INDEX_DIMENSION = 4000;
const DEFAULT_PARSE_CREATE_RETRIES = 3;
const DEFAULT_EMBED_BATCH_SIZE = 24;
const DEFAULT_EMBED_BATCH_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1500;
const DEFAULT_PARSE_SOURCE_URL_TTL_SECONDS = 3600;

type VectorStorageType = "vector" | "halfvec";

function asObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return fallback;
}

function parseFloatWithFallback(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function getNestedString(payload: unknown, path: string[]): string | null {
  let current: unknown = payload;

  for (const key of path) {
    const objectValue = asObject(current);
    current = objectValue[key];
  }

  return asNonEmptyString(current);
}

function inferParseStatus(payload: unknown): "success" | "failed" | "processing" {
  const status =
    getNestedString(payload, ["status"]) ??
    getNestedString(payload, ["job", "status"]) ??
    getNestedString(payload, ["data", "status"]);

  if (!status) return "processing";

  const normalized = status.toLowerCase();

  if (
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "done"
  ) {
    return "success";
  }

  if (
    normalized === "failed" ||
    normalized === "error" ||
    normalized === "cancelled"
  ) {
    return "failed";
  }

  return "processing";
}

function getDocumentVectorIndexName(): string {
  return (
    asNonEmptyString(process.env.DOCUMENT_RAG_VECTOR_INDEX) ??
    DEFAULT_VECTOR_INDEX_NAME
  );
}

function isValidVectorIndexName(value: string): boolean {
  return /^[a-zA-Z0-9_][a-zA-Z0-9_-]{2,127}$/.test(value);
}

function getValidatedVectorIndexName(): string {
  const indexName = getDocumentVectorIndexName();

  if (!isValidVectorIndexName(indexName)) {
    throw new Error("invalid_vector_index_name");
  }

  return indexName;
}

function getChunkSize(): number {
  return parsePositiveInteger(process.env.DOCUMENT_RAG_CHUNK_SIZE, DEFAULT_CHUNK_SIZE);
}

function getChunkOverlap(chunkSize: number): number {
  const parsed = parsePositiveInteger(
    process.env.DOCUMENT_RAG_CHUNK_OVERLAP,
    DEFAULT_CHUNK_OVERLAP
  );

  return Math.min(parsed, Math.max(chunkSize - 1, 0));
}

function getPollAttempts(): number {
  return parsePositiveInteger(
    process.env.LLAMA_PARSE_POLL_ATTEMPTS,
    DEFAULT_POLL_ATTEMPTS
  );
}

function getPollIntervalMs(): number {
  return parsePositiveInteger(
    process.env.LLAMA_PARSE_POLL_INTERVAL_MS,
    DEFAULT_POLL_INTERVAL_MS
  );
}

function getParseCreateRetries(): number {
  return parsePositiveInteger(
    process.env.LLAMA_PARSE_CREATE_JOB_RETRIES,
    DEFAULT_PARSE_CREATE_RETRIES
  );
}

function getEmbedBatchRetries(): number {
  return parsePositiveInteger(
    process.env.DOCUMENT_RAG_EMBED_BATCH_RETRIES,
    DEFAULT_EMBED_BATCH_RETRIES
  );
}

function getEmbedBatchSize(): number {
  return parsePositiveInteger(
    process.env.DOCUMENT_RAG_EMBED_BATCH_SIZE,
    DEFAULT_EMBED_BATCH_SIZE
  );
}

function getRetryDelayMs(): number {
  return parsePositiveInteger(
    process.env.DOCUMENT_PIPELINE_RETRY_DELAY_MS,
    DEFAULT_RETRY_DELAY_MS
  );
}

function getParseSourceUrlTtlSeconds(): number {
  const configured = parsePositiveInteger(
    process.env.LLAMA_PARSE_SOURCE_URL_TTL_SECONDS,
    0
  );

  if (configured > 0) {
    return configured;
  }

  const estimatedPollWindowSeconds = Math.ceil(
    (getPollAttempts() * getPollIntervalMs()) / 1000
  );

  return Math.max(
    DEFAULT_PARSE_SOURCE_URL_TTL_SECONDS,
    estimatedPollWindowSeconds + 300
  );
}

function getDefaultTopK(): number {
  return parsePositiveInteger(process.env.DOCUMENT_RAG_TOP_K, DEFAULT_TOP_K);
}

function getDefaultMinScore(): number {
  return parseFloatWithFallback(process.env.DOCUMENT_RAG_MIN_SCORE, DEFAULT_MIN_SCORE);
}

export function isDocumentPipelineAutoStartEnabled(): boolean {
  return parseBoolean(process.env.DOCUMENT_PIPELINE_AUTO_START, true);
}

function logPipeline(
  level: "info" | "warn" | "error",
  message: string,
  context?: JsonObject
) {
  const prefix = "[document-pipeline]";

  if (level === "error") {
    console.error(prefix, message, context ?? {});
    return;
  }

  if (level === "warn") {
    console.warn(prefix, message, context ?? {});
    return;
  }

  console.info(prefix, message, context ?? {});
}

function normalizeErrorForLog(error: unknown): JsonObject {
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;

  if (error instanceof LlamaParseHttpError) {
    return {
      name: error.name,
      message: error.message,
      status: error.status,
      details: error.details,
      cause: cause ? normalizeErrorForLog(cause) : undefined,
    };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      cause: cause ? normalizeErrorForLog(cause) : undefined,
    };
  }

  return {
    message: String(error),
  };
}

function getErrorStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const objectError = error as Record<string, unknown>;
  const candidates = [
    objectError.status,
    objectError.statusCode,
    objectError.responseStatus,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }

  const cause = objectError.cause;
  if (cause && typeof cause === "object") {
    const nested = getErrorStatusCode(cause);
    if (nested !== null) return nested;
  }

  return null;
}

function isRetryableEmbeddingError(error: unknown): boolean {
  const statusCode = getErrorStatusCode(error);
  if (statusCode !== null) {
    if (statusCode === 429) return true;
    if (statusCode >= 500) return true;
  }

  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  return (
    message.includes("internal server error") ||
    message.includes("timeout") ||
    message.includes("temporar") ||
    message.includes("rate limit")
  );
}

function estimateTokenCount(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words * 1.3));
}

async function withRetry<T>(input: {
  label: string;
  attempts: number;
  delayMs: number;
  fn: (attempt: number) => Promise<T>;
  context?: JsonObject;
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= input.attempts; attempt += 1) {
    try {
      return await input.fn(attempt);
    } catch (error) {
      lastError = error;
      const retryable = input.shouldRetry
        ? input.shouldRetry(error, attempt)
        : true;

      if (!retryable) {
        const reason =
          error instanceof Error ? error.message : "unknown_non_retryable_error";
        const wrapped = new Error(`${input.label}_non_retryable:${reason}`) as Error & {
          cause?: unknown;
        };
        wrapped.cause = error;
        throw wrapped;
      }

      if (attempt >= input.attempts) {
        const reason =
          error instanceof Error ? error.message : "unknown_retry_failure";
        const wrapped = new Error(`${input.label}_failed:${reason}`) as Error & {
          cause?: unknown;
        };
        wrapped.cause = error;
        throw wrapped;
      }

      logPipeline("warn", `${input.label}_retrying`, {
        ...asObject(input.context),
        attempt,
        maxAttempts: input.attempts,
        reason: error instanceof Error ? error.message : "unknown_retry_error",
        error: normalizeErrorForLog(error),
      });

      await sleep(input.delayMs);
    }
  }

  const fallbackReason =
    lastError instanceof Error ? lastError.message : "unknown_retry_failure";
  const wrapped = new Error(`${input.label}_failed:${fallbackReason}`) as Error & {
    cause?: unknown;
  };
  wrapped.cause = lastError;
  throw wrapped;
}

async function chunkTextWithMDocument(input: ParsedContent): Promise<ChunkingResult> {
  const sanitized = input.content.replace(/\r\n/g, "\n").trim();
  const isMarkdown = input.format === "markdown";
  const strategy: "markdown" | "recursive" = isMarkdown
    ? "markdown"
    : "recursive";

  if (sanitized.length === 0) {
    return {
      chunks: [],
      strategy,
      format: input.format,
    };
  }

  const chunkSize = getChunkSize();
  const overlap = getChunkOverlap(chunkSize);
  const doc = isMarkdown
    ? MDocument.fromMarkdown(sanitized)
    : MDocument.fromText(sanitized);

  const nodes = isMarkdown
    ? await doc.chunk({
        strategy: "markdown",
        maxSize: chunkSize,
        overlap,
        addStartIndex: true,
        stripWhitespace: true,
      })
    : await doc.chunk({
        strategy: "recursive",
        maxSize: chunkSize,
        overlap,
        separators: ["\n\n", "\n", " "],
        addStartIndex: true,
        stripWhitespace: true,
      });

  const chunks: ChunkRecord[] = [];

  for (const [index, node] of nodes.entries()) {
    const content = asNonEmptyString(node.text);
    if (!content) continue;

    const metadata = asObject(node.metadata);
    const startIndex =
      typeof metadata.startIndex === "number" ? metadata.startIndex : null;

    chunks.push({
      chunkIndex: index,
      content,
      tokenCount: estimateTokenCount(content),
      startIndex,
    });
  }

  return {
    chunks,
    strategy,
    format: input.format,
  };
}

function extractTextFromPages(pages: unknown, key: string): string {
  if (!Array.isArray(pages)) return "";

  const collected: string[] = [];

  for (const page of pages) {
    const pageObj = asObject(page);
    const value = asNonEmptyString(pageObj[key]);
    if (value) {
      collected.push(value);
    }
  }

  return collected.join("\n\n").trim();
}

function extractParsedContent(payload: unknown): ParsedContent | null {
  const markdownFull =
    getNestedString(payload, ["markdown_full"]) ??
    getNestedString(payload, ["markdown", "markdown_full"]) ??
    getNestedString(payload, ["data", "markdown_full"]);

  if (markdownFull) {
    return {
      content: markdownFull,
      format: "markdown",
      source: "markdown_full",
    };
  }

  const directText =
    getNestedString(payload, ["text_full"]) ??
    getNestedString(payload, ["text", "text_full"]) ??
    getNestedString(payload, ["data", "text_full"]);

  if (directText) {
    return {
      content: directText,
      format: "text",
      source: "text_full",
    };
  }

  const pageMarkdown =
    extractTextFromPages(
      asObject(payload).markdown && asObject(asObject(payload).markdown).pages,
      "markdown"
    ) ||
    extractTextFromPages(
      asObject(asObject(payload).data).markdown &&
        asObject(asObject(asObject(payload).data).markdown).pages,
      "markdown"
    );

  if (pageMarkdown) {
    return {
      content: pageMarkdown,
      format: "markdown",
      source: "markdown.pages",
    };
  }

  const pageText =
    extractTextFromPages(asObject(payload).text && asObject(asObject(payload).text).pages, "text") ||
    extractTextFromPages(
      asObject(asObject(payload).data).text && asObject(asObject(asObject(payload).data).text).pages,
      "text"
    );

  if (pageText) {
    return {
      content: pageText,
      format: "text",
      source: "text.pages",
    };
  }

  return null;
}

function getParseJobId(result: LlamaParseCreateJobResult): string {
  const id = asNonEmptyString(result.jobId);
  if (!id) {
    throw new Error("llama_parse_job_id_missing");
  }

  return id;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForParseCompletion(input: {
  parseJobId: string;
  expand: string[];
}): Promise<unknown> {
  const attempts = getPollAttempts();
  const intervalMs = getPollIntervalMs();
  let lastPollError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let payload: unknown;

    try {
      payload = await getLlamaParseJob({
        jobId: input.parseJobId,
        expand: input.expand,
      });
    } catch (error) {
      lastPollError = error;

      if (attempt < attempts) {
        logPipeline("warn", "llama_parse_poll_retry", {
          parseJobId: input.parseJobId,
          attempt,
          maxAttempts: attempts,
          reason: error instanceof Error ? error.message : "unknown_poll_error",
        });
        await sleep(intervalMs);
        continue;
      }

      throw new Error("llama_parse_poll_failed");
    }

    const status = inferParseStatus(payload);

    if (status === "success") {
      return payload;
    }

    if (status === "failed") {
      throw new Error("llama_parse_failed");
    }

    if (attempt < attempts) {
      await sleep(intervalMs);
    }
  }

  if (lastPollError) {
    throw new Error("llama_parse_poll_failed");
  }

  throw new Error("llama_parse_timeout");
}

async function embedChunkBatch(chunks: ChunkRecord[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  const initialBatchSize = Math.max(1, getEmbedBatchSize());
  const attempts = getEmbedBatchRetries();
  const delayMs = getRetryDelayMs();

  for (let i = 0; i < chunks.length; ) {
    let batchSize = Math.min(initialBatchSize, chunks.length - i);

    while (true) {
      const batch = chunks.slice(i, i + batchSize);

      try {
        const result = await withRetry({
          label: "embedding_batch",
          attempts,
          delayMs,
          shouldRetry: (error) => isRetryableEmbeddingError(error),
          context: {
            batchStart: i,
            batchSize: batch.length,
          },
          fn: async () => {
            const embedded = await embedValues({
              values: batch.map((chunk) => chunk.content),
              inputType: "passage",
            });

            if (embedded.embeddings.length !== batch.length) {
              throw new Error("embedding_batch_count_mismatch");
            }

            return embedded;
          },
        });

        embeddings.push(...result.embeddings);
        i += batch.length;
        break;
      } catch (error) {
        const nextBatchSize = Math.max(1, Math.floor(batchSize / 2));
        const shouldDownshift = isRetryableEmbeddingError(error) && nextBatchSize < batchSize;

        if (!shouldDownshift) {
          throw error;
        }

        logPipeline("warn", "embedding_batch_downshift", {
          batchStart: i,
          previousBatchSize: batchSize,
          nextBatchSize,
          reason: error instanceof Error ? error.message : "embedding_batch_failed",
          error: normalizeErrorForLog(error),
        });

        batchSize = nextBatchSize;
      }
    }
  }

  return embeddings;
}

async function ensureVectorIndex(input: {
  indexName: string;
  dimension: number;
}) {
  if (input.dimension <= 0) {
    throw new Error("invalid_embedding_dimension");
  }

  const knownIndexes = await documentVectorStore.listIndexes();
  const indexAlreadyExists = knownIndexes.includes(input.indexName);

  if (indexAlreadyExists) {
    const indexInfo = await documentVectorStore.describeIndex({
      indexName: input.indexName,
    });

    if (indexInfo.dimension !== input.dimension) {
      throw new Error(
        `vector_index_dimension_mismatch:${indexInfo.dimension}:${input.dimension}`
      );
    }

    return;
  }

  const vectorType: VectorStorageType =
    input.dimension > MAX_VECTOR_INDEX_DIMENSION &&
    input.dimension <= MAX_HALFVEC_INDEX_DIMENSION
      ? "halfvec"
      : "vector";

  const indexConfig =
    input.dimension > MAX_HALFVEC_INDEX_DIMENSION
      ? ({
          type: "flat",
        } as const)
      : ({
          type: "hnsw",
          hnsw: {
            m: 16,
            efConstruction: 64,
          },
        } as const);

  if (vectorType !== "vector" || indexConfig.type === "flat") {
    logPipeline("warn", "vector_index_strategy_selected", {
      indexName: input.indexName,
      dimension: input.dimension,
      vectorType,
      indexType: indexConfig.type,
      reason:
        indexConfig.type === "flat"
          ? "dimension_exceeds_halfvec_index_limit"
          : "dimension_exceeds_vector_hnsw_limit",
    });
  }

  await documentVectorStore.createIndex({
    indexName: input.indexName,
    dimension: input.dimension,
    metric: "cosine",
    vectorType,
    indexConfig,
    metadataIndexes: ["userId", "documentId", "sessionId"],
  });
}

function buildFilter(input: {
  userId: string;
  sessionId?: string;
  documentIds?: string[];
}): RetrievalFilter {
  const normalizedDocIds = (input.documentIds ?? []).filter(
    (value) => typeof value === "string" && value.trim().length > 0
  );

  const filter: RetrievalFilter = {
    userId: input.userId,
  };

  if (input.sessionId) {
    filter.sessionId = input.sessionId;
  }

  if (normalizedDocIds.length > 0) {
    filter.documentId = { $in: normalizedDocIds };
  }

  return filter;
}

function parseErrorMessage(error: unknown): string {
  const cause =
    error && typeof error === "object" && "cause" in error
      ? (error as { cause?: unknown }).cause
      : undefined;

  if (error instanceof Error) {
    if (cause instanceof Error && cause.message && cause.message !== error.message) {
      return `${error.message} | cause: ${cause.message}`.slice(0, 1000);
    }

    return error.message.slice(0, 1000);
  }

  return "document_pipeline_failed";
}

export async function runDocumentIngestionPipeline(input: RunPipelineInput) {
  const onPhaseChange = input.onPhaseChange;

  const document = await prisma.uploadedDocument.findFirst({
    where: {
      id: input.documentId,
      userId: input.userId,
    },
    select: {
      id: true,
      userId: true,
      sessionId: true,
      filename: true,
      mimeType: true,
      r2Key: true,
      checksum: true,
      metadata: true,
    },
  });

  if (!document) {
    return {
      success: false,
      documentId: input.documentId,
      reason: "document_not_found",
    };
  }

  const now = new Date();

  const ingestionJob = await prisma.$transaction(async (tx) => {
    const existing = input.ingestionJobId
      ? await tx.ingestionJob.findFirst({
          where: {
            id: input.ingestionJobId,
            documentId: document.id,
            userId: document.userId,
          },
          select: {
            id: true,
            attempt: true,
            metadata: true,
          },
        })
      : await tx.ingestionJob.findFirst({
          where: {
            documentId: document.id,
            userId: document.userId,
            status: "queued",
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            attempt: true,
            metadata: true,
          },
        });

    const nextMetadata = {
      ...asObject(existing?.metadata),
      pipeline: {
        trigger: input.trigger,
        state: "started",
      },
    };

    const nextAttempt = (existing?.attempt ?? 0) + 1;

    const currentJob = existing
      ? await tx.ingestionJob.update({
          where: {
            id: existing.id,
          },
          data: {
            status: "processing",
            phase: "parse",
            startedAt: now,
            completedAt: null,
            errorMessage: null,
            attempt: nextAttempt,
            metadata: nextMetadata,
          },
          select: {
            id: true,
            attempt: true,
          },
        })
      : await tx.ingestionJob.create({
          data: {
            documentId: document.id,
            userId: document.userId,
            status: "processing",
            phase: "parse",
            startedAt: now,
            attempt: nextAttempt,
            metadata: nextMetadata,
          },
          select: {
            id: true,
            attempt: true,
          },
        });

    await tx.uploadedDocument.update({
      where: { id: document.id },
      data: {
        status: "processing",
        errorMessage: null,
      },
    });

    return currentJob;
  });

  let currentPhase: "parse" | "chunk" | "embed" | "index" = "parse";

  try {
    const vectorIndexName = getValidatedVectorIndexName();
    const parseDefaults = getLlamaParseDefaults();
    const parseCreateRetries = getParseCreateRetries();
    const retryDelayMs = getRetryDelayMs();
    const sourceUrlTtlSeconds = getParseSourceUrlTtlSeconds();

    logPipeline("info", "pipeline_started", {
      documentId: document.id,
      ingestionJobId: ingestionJob.id,
      trigger: input.trigger,
      vectorIndexName,
    });

    const parseSubmission = await withRetry({
      label: "llama_parse_create_job",
      attempts: parseCreateRetries,
      delayMs: retryDelayMs,
      shouldRetry: (error) => {
        if (error instanceof LlamaParseHttpError) {
          if (error.status === 429) return true;
          if (error.status >= 500) return true;
          return false;
        }

        return true;
      },
      context: {
        documentId: document.id,
      },
      fn: async () => {
        const source = await getR2SignedGetUrl({
          key: document.r2Key,
          fileName: document.filename,
          expiresInSeconds: sourceUrlTtlSeconds,
        });

        const parseCreate = await createLlamaParseJobFromSourceUrl({
          sourceUrl: source.url,
          tier: parseDefaults.defaultTier,
          version: parseDefaults.defaultVersion,
          expand: parseDefaults.defaultExpand,
          configuration: parseDefaults.defaultConfiguration,
        });

        return {
          source,
          parseCreate,
          parseJobId: getParseJobId(parseCreate),
        };
      },
    });

    const { source, parseCreate, parseJobId } = parseSubmission;

    await prisma.ingestionJob.update({
      where: {
        id: ingestionJob.id,
      },
      data: {
        phase: "parse",
        metadata: {
          parser: {
            provider: "llama-parse",
            parseJobId,
            request: parseCreate.request,
            sourceUrlExpiresAt: source.expiresAt,
            sourceUrlTtlSeconds,
            submittedAt: new Date().toISOString(),
          },
          pipeline: {
            trigger: input.trigger,
            state: "parse_submitted",
          },
        },
      },
    });

    logPipeline("info", "parse_job_submitted", {
      documentId: document.id,
      ingestionJobId: ingestionJob.id,
      parseJobId,
    });

    await onPhaseChange?.("parsing", 10);

    const parseResult = await waitForParseCompletion({
      parseJobId,
      expand: parseDefaults.defaultExpand,
    });

    await prisma.ingestionJob.update({
      where: {
        id: ingestionJob.id,
      },
      data: {
        phase: "chunk",
      },
    });

    currentPhase = "chunk";
    const parsedContent = extractParsedContent(parseResult);
    if (!parsedContent) {
      throw new Error("parsed_text_empty");
    }

    const chunkingResult = await chunkTextWithMDocument(parsedContent);
    const chunks = chunkingResult.chunks;
    if (chunks.length === 0) {
      throw new Error("chunk_generation_empty");
    }

    logPipeline("info", "chunking_completed", {
      documentId: document.id,
      ingestionJobId: ingestionJob.id,
      chunkCount: chunks.length,
      chunkStrategy: chunkingResult.strategy,
      parsedFormat: chunkingResult.format,
      parsedSource: parsedContent.source,
    });

    await onPhaseChange?.("chunking", 40);

    await prisma.ingestionJob.update({
      where: {
        id: ingestionJob.id,
      },
      data: {
        phase: "embed",
      },
    });
    currentPhase = "embed";

    await onPhaseChange?.("embedding", 60);

    const embeddings = await embedChunkBatch(chunks);
    if (embeddings.length !== chunks.length) {
      throw new Error("embedding_count_mismatch");
    }

    const distinctDimensions = new Set(embeddings.map((vector) => vector.length));
    if (distinctDimensions.size > 1) {
      throw new Error("embedding_dimension_inconsistent");
    }

    const dimension = embeddings[0]?.length;
    if (!dimension || dimension <= 0) {
      throw new Error("invalid_embedding_dimension");
    }

    await ensureVectorIndex({
      indexName: vectorIndexName,
      dimension,
    });

    const vectorIds = chunks.map(
      (chunk) => `${document.id}:${chunk.chunkIndex}:${randomUUID()}`
    );

    await documentVectorStore.upsert({
      indexName: vectorIndexName,
      vectors: embeddings,
      ids: vectorIds,
      metadata: chunks.map((chunk) => ({
        text: chunk.content,
        userId: document.userId,
        documentId: document.id,
        sessionId: document.sessionId,
        filename: document.filename,
        mimeType: document.mimeType,
        checksum: document.checksum,
        chunkIndex: chunk.chunkIndex,
        startIndex: chunk.startIndex,
      })),
      deleteFilter: {
        userId: document.userId,
        documentId: document.id,
      },
    });

    await onPhaseChange?.("indexing", 85);

    currentPhase = "index";

    await prisma.$transaction(async (tx) => {
      await tx.ingestionJob.update({
        where: { id: ingestionJob.id },
        data: {
          status: "completed",
          phase: "index",
          completedAt: new Date(),
          errorMessage: null,
          metadata: {
            parser: {
              provider: "llama-parse",
              parseJobId,
              state: "completed",
            },
            pipeline: {
              trigger: input.trigger,
              state: "completed",
              chunkCount: chunks.length,
              chunkStrategy: chunkingResult.strategy,
              parsedFormat: chunkingResult.format,
              vectorIndex: vectorIndexName,
            },
          },
        },
      });

      await tx.uploadedDocument.update({
        where: { id: document.id },
        data: {
          status: "ready",
          errorMessage: null,
          metadata: {
            ...asObject(document.metadata),
            parser: {
              provider: "llama-parse",
              parseJobId,
              state: "completed",
            },
            rag: {
              indexName: vectorIndexName,
              chunkCount: chunks.length,
              chunkStrategy: chunkingResult.strategy,
              parsedFormat: chunkingResult.format,
              updatedAt: new Date().toISOString(),
            },
          },
        },
      });
    });

    await onPhaseChange?.("completed", 100);

    return {
      success: true,
      documentId: document.id,
      ingestionJobId: ingestionJob.id,
      parseJobId,
      chunkCount: chunks.length,
      vectorIndex: vectorIndexName,
    };
  } catch (error) {
    const errorMessage = parseErrorMessage(error);

    logPipeline("error", "pipeline_failed", {
      documentId: document.id,
      ingestionJobId: ingestionJob.id,
      phase: currentPhase,
      reason: errorMessage,
      error: normalizeErrorForLog(error),
    });

    await prisma.$transaction(async (tx) => {
      await tx.ingestionJob.update({
        where: { id: ingestionJob.id },
        data: {
          status: "failed",
          phase: currentPhase,
          completedAt: new Date(),
          errorMessage,
          metadata: {
            pipeline: {
              trigger: input.trigger,
              state: "failed",
              failedPhase: currentPhase,
            },
          },
        },
      });

      await tx.uploadedDocument.update({
        where: { id: document.id },
        data: {
          status: "failed",
          errorMessage,
        },
      });
    });

    return {
      success: false,
      documentId: document.id,
      ingestionJobId: ingestionJob.id,
      reason: errorMessage,
    };
  }
}

export async function retrieveDocumentContext(input: RetrieveDocumentContextInput) {
  const normalizedQuery = input.query.trim();

  if (normalizedQuery.length === 0) {
    return {
      context: "",
      citations: [],
      matches: [],
      topK: 0,
    };
  }

  const topK = input.topK && input.topK > 0 ? input.topK : getDefaultTopK();
  const minScore = getDefaultMinScore();
  const vectorIndexName = getValidatedVectorIndexName();

  const embedded = await embedValues({
    values: [normalizedQuery],
    inputType: "query",
  });

  const queryVector = embedded.embeddings[0];
  if (!queryVector) {
    throw new Error("query_embedding_failed");
  }

  const filter = buildFilter({
    userId: input.userId,
    sessionId: input.sessionId,
    documentIds: input.documentIds,
  });

  const matches = await documentVectorStore.query({
    indexName: vectorIndexName,
    queryVector,
    topK,
    filter,
    includeVector: false,
    minScore,
  });

  const finalMatches =
    matches.length > 0 || minScore <= 0
      ? matches
      : await documentVectorStore.query({
          indexName: vectorIndexName,
          queryVector,
          topK,
          filter,
          includeVector: false,
        });

  if (matches.length === 0 && finalMatches.length > 0 && minScore > 0) {
    logPipeline("warn", "retrieval_min_score_fallback", {
      userId: input.userId,
      sessionId: input.sessionId,
      documentIds: input.documentIds,
      minScore,
      recoveredCount: finalMatches.length,
    });
  }

  const citations = finalMatches.map((match) => {
    const metadata = asObject(match.metadata);

    return {
      vectorId: match.id,
      score: match.score,
      documentId: asNonEmptyString(metadata.documentId),
      filename: asNonEmptyString(metadata.filename),
      chunkIndex:
        typeof metadata.chunkIndex === "number" ? metadata.chunkIndex : null,
    };
  });

  const context = finalMatches
    .map((match, index) => {
      const metadata = asObject(match.metadata);
      const text = asNonEmptyString(metadata.text) ?? "";
      const filename = asNonEmptyString(metadata.filename) ?? "unknown";
      const chunkIndex =
        typeof metadata.chunkIndex === "number" ? metadata.chunkIndex : index;

      return `[${index + 1}] ${filename}#${chunkIndex}\n${text}`;
    })
    .join("\n\n");

  return {
    context,
    citations,
    matches: finalMatches,
    topK,
  };
}
