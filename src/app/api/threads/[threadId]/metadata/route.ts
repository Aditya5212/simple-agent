import { companionMemory } from "@/mastra/storage";

type MetadataRequest = {
  metadata?: Record<string, unknown>;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as MetadataRequest | null;
  const metadata =
    body?.metadata && typeof body.metadata === "object" ? body.metadata : null;

  if (!metadata) {
    return Response.json({ error: "metadata is required" }, { status: 400 });
  }

  const thread = await companionMemory.getThreadById({
    threadId,
  });

  if (!thread) {
    return Response.json({ error: "thread not found" }, { status: 404 });
  }

  const updated = await companionMemory.updateThread({
    id: threadId,
    title: thread.title ?? "",
    metadata,
  });

  return Response.json(updated);
}
