import { companionMemory } from "@/mastra/storage";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as {
    keepLast?: number;
  } | null;
  const keepLast = typeof body?.keepLast === "number" ? body.keepLast : 0;

  const result = await companionMemory.recall({
    threadId,
    perPage: false,
    orderBy: { field: "createdAt", direction: "ASC" },
  });

  if (keepLast <= 0) {
    const messageIds = result.messages.map(message => message.id);
    if (messageIds.length === 0) {
      return Response.json({ deleted: 0, threadId });
    }
    await companionMemory.deleteMessages(messageIds);
    return Response.json({ deleted: messageIds.length, threadId });
  }

  const toDelete = result.messages.slice(0, Math.max(0, result.messages.length - keepLast));
  const messageIds = toDelete.map(message => message.id);

  if (messageIds.length === 0) {
    return Response.json({ deleted: 0, threadId });
  }

  await companionMemory.deleteMessages(messageIds);

  return Response.json({ deleted: messageIds.length, threadId });
}
