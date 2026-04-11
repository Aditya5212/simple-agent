import { embedder } from "@/mastra/storage";

type EmbeddingRequest = {
  input?: string | string[];
  inputType?: "query" | "passage";
  dimensions?: number;
  user?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as EmbeddingRequest | null;
  const input = body?.input ?? "Test embedding";
  const values = Array.isArray(input) ? input : [input];
  const sanitized = values
    .map(value => (typeof value === "string" ? value.trim() : ""))
    .filter(value => value.length > 0);

  if (sanitized.length === 0) {
    return Response.json({ error: "input is required" }, { status: 400 });
  }

  const inputType = body?.inputType ?? "passage";

  if (embedder.provider === "nvidia" && process.env.NVIDIA_API_KEY_EMBED) {
    const response = await fetch("https://integrate.api.nvidia.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NVIDIA_API_KEY_EMBED}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: embedder.modelId,
        input: sanitized,
        input_type: inputType,
        encoding_format: "float",
        dimensions: body?.dimensions,
        user: body?.user,
      }),
    });

    const data = (await response.json().catch(() => null)) as
      | {
        data?: Array<{ embedding: number[] }>;
        error?: unknown;
      }
      | null;

    if (!response.ok) {
      return Response.json(
        {
          error: "NVIDIA embeddings request failed",
          detail: data?.error ?? data ?? "Unknown error",
        },
        { status: response.status }
      );
    }

    const embeddings = data?.data?.map(item => item.embedding) ?? [];

    return Response.json({
      provider: embedder.provider,
      modelId: embedder.modelId,
      count: embeddings.length,
      dimensions: embeddings[0]?.length ?? 0,
      embeddings,
    });
  }

  let providerOptions:
    | { "openai-compatible": Record<string, number | string> }
    | undefined;

  if (body?.dimensions !== undefined || body?.user !== undefined) {
    const openAiCompatible: Record<string, number | string> = {};

    if (body?.dimensions !== undefined) {
      openAiCompatible.dimensions = body.dimensions;
    }

    if (body?.user !== undefined) {
      openAiCompatible.user = body.user;
    }

    providerOptions = { "openai-compatible": openAiCompatible };
  }

  const result = await embedder.doEmbed({
    values: sanitized,
    providerOptions,
  });

  return Response.json({
    provider: embedder.provider,
    modelId: embedder.modelId,
    count: result.embeddings.length,
    dimensions: result.embeddings[0]?.length ?? 0,
    embeddings: result.embeddings,
  });
}
