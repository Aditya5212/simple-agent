import { companionMemory } from "@/mastra/storage";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const result = await companionMemory.recall({
    threadId,
    perPage: false,
  });

  const messageIds = result.messages.map(message => message.id);

  if (messageIds.length === 0) {
    return Response.json({ deleted: 0, threadId });
  }

  await companionMemory.deleteMessages(messageIds);

  return Response.json({ deleted: messageIds.length, threadId });
}
