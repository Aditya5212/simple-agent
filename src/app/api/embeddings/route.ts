import { embedder } from "@/mastra/storage";

type EmbeddingRequest = {
  input?: string | string[];
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

  const result = await embedder.doEmbed({ values: sanitized });

  return Response.json({
    provider: embedder.provider,
    modelId: embedder.modelId,
    count: result.embeddings.length,
    dimensions: result.embeddings[0]?.length ?? 0,
    embeddings: result.embeddings,
  });
}
