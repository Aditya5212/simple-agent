import { EmbeddingHttpError, embedValues } from "@/mastra/storage";

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

  try {
    const result = await embedValues({
      values: sanitized,
      inputType: body?.inputType ?? "passage",
      dimensions: body?.dimensions,
      user: body?.user,
    });

    return Response.json({
      provider: result.provider,
      modelId: result.modelId,
      count: result.embeddings.length,
      dimensions: result.embeddings[0]?.length ?? 0,
      embeddings: result.embeddings,
    });
  } catch (error) {
    if (error instanceof EmbeddingHttpError) {
      return Response.json(
        {
          error: error.message,
          detail: error.details,
        },
        { status: error.status }
      );
    }

    const message = error instanceof Error ? error.message : "embedding_failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
