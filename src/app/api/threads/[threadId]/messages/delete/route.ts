import { companionMemory } from "@/mastra/storage";

type DeleteMessagesRequest = {
  messageIds?: string[];
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as DeleteMessagesRequest | null;
  const messageIds = Array.isArray(body?.messageIds)
    ? body?.messageIds.filter(id => typeof id === "string" && id.length > 0)
    : [];

  if (messageIds.length === 0) {
    return Response.json({ error: "messageIds is required" }, { status: 400 });
  }

  await companionMemory.deleteMessages(messageIds);

  return Response.json({
    deleted: messageIds.length,
    threadId,
  });
}
