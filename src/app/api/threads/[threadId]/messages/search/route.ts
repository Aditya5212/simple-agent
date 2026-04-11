import { companionMemory } from "@/mastra/storage";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q") ?? "";
  const resourceId = searchParams.get("resourceId") ?? undefined;

  if (!query.trim()) {
    return Response.json({ error: "q is required" }, { status: 400 });
  }

  const result = await companionMemory.recall({
    threadId,
    resourceId,
    vectorSearchString: query,
  });

  return Response.json(result);
}
