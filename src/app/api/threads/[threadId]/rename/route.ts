import { companionMemory } from "@/mastra/storage";

type RenameThreadRequest = {
  title?: string;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as RenameThreadRequest | null;
  const title = typeof body?.title === "string" ? body.title : "";

  if (!title) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const thread = await companionMemory.getThreadById({
    threadId,
  });

  if (!thread) {
    return Response.json({ error: "thread not found" }, { status: 404 });
  }

  const updated = await companionMemory.updateThread({
    id: threadId,
    title,
    metadata: thread.metadata ?? {},
  });

  return Response.json(updated);
}
