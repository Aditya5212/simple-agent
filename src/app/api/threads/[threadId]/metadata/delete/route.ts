import { companionMemory } from "@/mastra/storage";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const thread = await companionMemory.getThreadById({
    threadId,
  });

  if (!thread) {
    return Response.json({ error: "thread not found" }, { status: 404 });
  }

  const updated = await companionMemory.updateThread({
    id: threadId,
    title: thread.title ?? "",
    metadata: {},
  });

  return Response.json(updated);
}
