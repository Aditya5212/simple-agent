type LlamaParseTier = "fast" | "cost_effective" | "agentic" | "agentic_plus";

type JsonObject = Record<string, unknown>;

type LlamaParseRuntimeConfig = {
  apiKey: string;
  baseUrl: string;
  defaultTier: LlamaParseTier;
  defaultVersion: string;
  defaultExpand: string[];
  defaultConfiguration: JsonObject;
};

export type LlamaParseCreateJobInput = {
  sourceUrl: string;
  tier?: LlamaParseTier;
  version?: string;
  expand?: string[];
  configuration?: JsonObject;
};

export type LlamaParseGetJobInput = {
  jobId: string;
  expand?: string[];
};

export type LlamaParseCreateJobResult = {
  jobId: string | null;
  request: {
    tier: string;
    version: string;
    expand: string[];
  };
  response: unknown;
};

const DEFAULT_BASE_URL = "https://api.cloud.llamaindex.ai/api/v2";
const DEFAULT_TIER: LlamaParseTier = "agentic";
const DEFAULT_VERSION = "latest";
const DEFAULT_EXPAND = ["markdown", "text", "metadata"];

let cachedRuntimeConfig: LlamaParseRuntimeConfig | null = null;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asObject(value: unknown): JsonObject | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }
  return null;
}

function stringifyUnknown(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function getRequiredEnv(name: string): string {
  const value = asNonEmptyString(process.env[name]);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseTier(value: string | null): LlamaParseTier {
  if (!value) return DEFAULT_TIER;
  const normalized = value.toLowerCase();
  if (normalized === "fast") return "fast";
  if (normalized === "cost_effective") return "cost_effective";
  if (normalized === "agentic") return "agentic";
  if (normalized === "agentic_plus") return "agentic_plus";
  return DEFAULT_TIER;
}

function parseExpandList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const unique = new Set<string>();

  for (const item of value) {
    const parsed = asNonEmptyString(item);
    if (parsed) {
      unique.add(parsed);
    }
  }

  return Array.from(unique);
}

function parseExpandFromEnv(raw: string | null): string[] {
  if (!raw) return DEFAULT_EXPAND;

  const parsed = raw
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return parsed.length > 0 ? Array.from(new Set(parsed)) : DEFAULT_EXPAND;
}

function parseDefaultConfiguration(raw: string | null): JsonObject {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    const value = asObject(parsed);
    if (!value) {
      throw new Error("must be a JSON object");
    }
    return value;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "invalid JSON";
    throw new Error(`Invalid LLAMA_PARSE_CONFIGURATION_JSON: ${reason}`);
  }
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function getRuntimeConfig(): LlamaParseRuntimeConfig {
  if (cachedRuntimeConfig) return cachedRuntimeConfig;

  const apiKey = getRequiredEnv("LLAMA_CLOUD_API_KEY");
  const baseUrl =
    asNonEmptyString(process.env.LLAMA_PARSE_BASE_URL) ?? DEFAULT_BASE_URL;
  const defaultTier = parseTier(asNonEmptyString(process.env.LLAMA_PARSE_TIER));
  const defaultVersion =
    asNonEmptyString(process.env.LLAMA_PARSE_VERSION) ?? DEFAULT_VERSION;
  const defaultExpand = parseExpandFromEnv(
    asNonEmptyString(process.env.LLAMA_PARSE_DEFAULT_EXPAND)
  );
  const defaultConfiguration = parseDefaultConfiguration(
    asNonEmptyString(process.env.LLAMA_PARSE_CONFIGURATION_JSON)
  );

  cachedRuntimeConfig = {
    apiKey,
    baseUrl: trimTrailingSlashes(baseUrl),
    defaultTier,
    defaultVersion,
    defaultExpand,
    defaultConfiguration,
  };

  return cachedRuntimeConfig;
}

export function getLlamaParseDefaults() {
  const config = getRuntimeConfig();

  return {
    baseUrl: config.baseUrl,
    defaultTier: config.defaultTier,
    defaultVersion: config.defaultVersion,
    defaultExpand: config.defaultExpand,
    defaultConfiguration: config.defaultConfiguration,
  };
}

export class LlamaParseHttpError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "LlamaParseHttpError";
    this.status = status;
    this.details = details;
  }
}

function extractProviderErrorText(payload: unknown): string | null {
  const top = asObject(payload);
  if (!top) return null;

  const detailValue = top.detail;
  if (Array.isArray(detailValue)) {
    const detailParts = detailValue
      .map((entry) => {
        const objectEntry = asObject(entry);
        if (!objectEntry) {
          return stringifyUnknown(entry);
        }

        const msg = asNonEmptyString(objectEntry.msg);
        const type = asNonEmptyString(objectEntry.type);
        const locRaw = Array.isArray(objectEntry.loc)
          ? objectEntry.loc
              .map((item) => stringifyUnknown(item))
              .filter((item): item is string => Boolean(item))
              .join(".")
          : null;

        if (msg && locRaw && type) return `${locRaw}: ${msg} (${type})`;
        if (msg && locRaw) return `${locRaw}: ${msg}`;
        if (msg && type) return `${msg} (${type})`;
        if (msg) return msg;
        if (type) return type;

        return stringifyUnknown(entry);
      })
      .filter((item): item is string => Boolean(item));

    if (detailParts.length > 0) {
      return detailParts.join("; ");
    }
  }

  const candidates: unknown[] = [
    top.message,
    top.error,
    top.detail,
    top.errors,
    asObject(top.error)?.message,
    asObject(top.error)?.detail,
    asObject(top.errors)?.message,
    asObject(top.errors)?.detail,
  ];

  for (const candidate of candidates) {
    const parsed = asNonEmptyString(candidate);
    if (parsed) return parsed;
  }

  return null;
}

async function callLlamaParse(path: string, init: RequestInit): Promise<unknown> {
  const config = getRuntimeConfig();
  const url = `${config.baseUrl}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  const rawText = await response.text();
  let payload: unknown = null;

  if (rawText.length > 0) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = rawText;
    }
  }

  if (!response.ok) {
    const providerReason = extractProviderErrorText(payload);
    const message = providerReason
      ? `Llama Parse request failed (${response.status}): ${providerReason}`
      : `Llama Parse request failed (${response.status})`;

    throw new LlamaParseHttpError(
      message,
      response.status,
      payload
    );
  }

  return payload;
}

function extractJobId(payload: unknown): string | null {
  const candidates: Array<JsonObject | null> = [];
  const top = asObject(payload);

  if (top) {
    candidates.push(top);
    candidates.push(asObject(top.data));
    candidates.push(asObject(top.job));
    candidates.push(asObject(top.parse_job));
    candidates.push(asObject(top.result));
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const fromId = asNonEmptyString(candidate.id);
    if (fromId) return fromId;
    const fromSnake = asNonEmptyString(candidate.job_id);
    if (fromSnake) return fromSnake;
    const fromCamel = asNonEmptyString(candidate.jobId);
    if (fromCamel) return fromCamel;
  }

  return null;
}

function buildCreateBody(input: LlamaParseCreateJobInput) {
  const defaults = getRuntimeConfig();

  const merged: JsonObject = {
    ...defaults.defaultConfiguration,
    ...(input.configuration ?? {}),
  };

  merged.source_url = input.sourceUrl;

  merged.tier =
    input.tier ??
    asNonEmptyString(merged.tier) ??
    defaults.defaultTier;

  merged.version =
    asNonEmptyString(input.version) ??
    asNonEmptyString(merged.version) ??
    defaults.defaultVersion;

  const inputExpand = parseExpandList(input.expand);
  const mergedExpand = parseExpandList(merged.expand);
  const expand =
    inputExpand.length > 0
      ? inputExpand
      : mergedExpand.length > 0
        ? mergedExpand
        : defaults.defaultExpand;

  // Llama Parse v2 expects expand only when retrieving job output via GET /parse/{jobId}.
  // Sending expand in POST /parse request body causes 422 validation errors.
  delete merged.expand;

  return {
    body: merged,
    tier: String(merged.tier),
    version: String(merged.version),
    expand,
  };
}

function buildExpandQuery(expand: string[] | undefined): string {
  if (!expand || expand.length === 0) return "";

  const params = new URLSearchParams();
  for (const field of expand) {
    const value = asNonEmptyString(field);
    if (value) {
      params.append("expand", value);
    }
  }

  const query = params.toString();
  return query.length > 0 ? `?${query}` : "";
}

export async function createLlamaParseJobFromSourceUrl(
  input: LlamaParseCreateJobInput
): Promise<LlamaParseCreateJobResult> {
  const sourceUrl = asNonEmptyString(input.sourceUrl);
  if (!sourceUrl) {
    throw new Error("sourceUrl is required");
  }

  const createPayload = buildCreateBody({
    ...input,
    sourceUrl,
  });

  const response = await callLlamaParse("/parse", {
    method: "POST",
    body: JSON.stringify(createPayload.body),
  });

  return {
    jobId: extractJobId(response),
    request: {
      tier: createPayload.tier,
      version: createPayload.version,
      expand: createPayload.expand,
    },
    response,
  };
}

export async function getLlamaParseJob(input: LlamaParseGetJobInput) {
  const jobId = asNonEmptyString(input.jobId);
  if (!jobId) {
    throw new Error("jobId is required");
  }

  const query = buildExpandQuery(parseExpandList(input.expand));
  return callLlamaParse(`/parse/${encodeURIComponent(jobId)}${query}`, {
    method: "GET",
  });
}

export function parseLlamaParseExpandQuery(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}
