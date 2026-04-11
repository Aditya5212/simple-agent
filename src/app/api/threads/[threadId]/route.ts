import { companionMemory } from "@/mastra/storage";

type UpdateThreadRequest = {
  title?: string;
  metadata?: Record<string, unknown>;
  resourceId?: string;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const resourceId = searchParams.get("resourceId") ?? undefined;
  const thread = await companionMemory.getThreadById({
    threadId,
  });

  if (!thread || (resourceId && thread.resourceId !== resourceId)) {
    return Response.json({ error: "thread not found" }, { status: 404 });
  }

  return Response.json(thread);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as UpdateThreadRequest | null;
  const resourceId = typeof body?.resourceId === "string" ? body.resourceId : undefined;
  const thread = await companionMemory.getThreadById({
    threadId,
  });

  if (!thread || (resourceId && thread.resourceId !== resourceId)) {
    return Response.json({ error: "thread not found" }, { status: 404 });
  }

  const nextTitle =
    typeof body?.title === "string" ? body.title : thread.title ?? "";
  const nextMetadata =
    body?.metadata && typeof body.metadata === "object"
      ? body.metadata
      : thread.metadata ?? {};

  if (!nextTitle) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const updated = await companionMemory.updateThread({
    id: threadId,
    title: nextTitle,
    metadata: nextMetadata,
  });

  return Response.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const resourceId = searchParams.get("resourceId") ?? undefined;
  const thread = await companionMemory.getThreadById({ threadId });

  if (!thread || (resourceId && thread.resourceId !== resourceId)) {
    return Response.json({ error: "thread not found" }, { status: 404 });
  }

  await companionMemory.deleteThread(threadId);
  return Response.json({ deleted: true, threadId });
}
