import { companionMemory } from "@/mastra/storage";

type UpdateThreadRequest = {
  title?: string;
  metadata?: Record<string, unknown>;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as UpdateThreadRequest | null;
  const title = typeof body?.title === "string" ? body.title : "";
  const metadata =
    body?.metadata && typeof body.metadata === "object" ? body.metadata : null;

  if (!title && !metadata) {
    return Response.json(
      { error: "title or metadata is required" },
      { status: 400 }
    );
  }

  const thread = await companionMemory.getThreadById({
    threadId,
  });

  if (!thread) {
    return Response.json({ error: "thread not found" }, { status: 404 });
  }

  const updated = await companionMemory.updateThread({
    id: threadId,
    title: title || thread.title || "",
    metadata: metadata ?? thread.metadata ?? {},
  });

  return Response.json(updated);
}
