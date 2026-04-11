import { companionMemory } from "@/mastra/storage";

type UpdateMessagesRequest = {
  messages?: Array<{
    id: string;
    content?: string;
  }>;
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as UpdateMessagesRequest | null;
  const messages = Array.isArray(body?.messages) ? body.messages : [];

  if (messages.length === 0) {
    return Response.json({ error: "messages is required" }, { status: 400 });
  }

  const updated = await companionMemory.updateMessages({
    messages: messages.map(message => ({
      id: message.id,
      ...(message.content !== undefined
        ? {
          content: {
            format: 2,
            parts: [{ type: "text", text: message.content }],
            content: message.content,
          },
        }
        : {}),
      threadId,
    })),
  });

  return Response.json({
    threadId,
    messages: updated,
  });
}
