import { auth } from "@/app/(auth)/auth";
import { prisma } from "@/lib/prisma";
import type { ChatMessage } from "@/lib/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return Response.json({ error: "chatId required" }, { status: 400 });
  }

  const authSession = await auth();

  const sessionRecord = await prisma.session.findFirst({
    where: {
      id: chatId,
      sessionType: "AI_AGENT",
    },
  });

  if (!sessionRecord) {
    return Response.json({
      messages: [],
      visibility: "private",
      userId: null,
      isReadonly: false,
    });
  }

  const metadata =
    sessionRecord.metadata && typeof sessionRecord.metadata === "object"
      ? (sessionRecord.metadata as Record<string, unknown>)
      : {};
  const visibility = metadata.visibility === "public" ? "public" : "private";
  const isOwner = authSession?.user?.id === sessionRecord.userId;

  if (!isOwner && visibility !== "public") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const conversations = await prisma.aIAgentConversation.findMany({
    where: {
      sessionId: sessionRecord.id,
      userId: sessionRecord.userId,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      id: true,
      requestId: true,
      userMessage: true,
      aiResponse: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const messages: ChatMessage[] = conversations.flatMap((conversation) => {
    const baseId = conversation.requestId || conversation.id;

    const userMessage: ChatMessage = {
      id: `${baseId}-user`,
      role: "user",
      parts: [{ type: "text", text: conversation.userMessage }],
      metadata: {
        createdAt: conversation.createdAt.toISOString(),
      },
    };

    if (!conversation.aiResponse) {
      return [userMessage];
    }

    const assistantMessage: ChatMessage = {
      id: `${baseId}-assistant`,
      role: "assistant",
      parts: [{ type: "text", text: conversation.aiResponse }],
      metadata: {
        createdAt: conversation.updatedAt.toISOString(),
      },
    };

    return [userMessage, assistantMessage];
  });

  return Response.json({
    messages,
    visibility,
    userId: sessionRecord.userId,
    isReadonly: !isOwner,
    supportsVotes: false,
  });
}
