"use server";

import { auth } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/chat/visibility-selector";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
} from "@/lib/db/queries";
import { prisma } from "@/lib/prisma";
import type { ChatMessage } from "@/lib/types";
import { getTextFromMessage } from "@/lib/utils";

function getBaseMessageId(id: string) {
  if (id.endsWith("-assistant")) {
    return id.slice(0, -"-assistant".length);
  }
  if (id.endsWith("-user")) {
    return id.slice(0, -"-user".length);
  }
  return id;
}

export async function generateTitleFromUserMessage({
  message,
}: {
  message: ChatMessage;
}) {
  const text = getTextFromMessage(message).trim();
  if (!text) {
    return "New chat";
  }
  return text.split(/\s+/).slice(0, 8).join(" ");
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const baseId = getBaseMessageId(id);
  const conversation = await prisma.aIAgentConversation.findFirst({
    where: {
      userId: session.user.id,
      OR: [{ id: baseId }, { requestId: baseId }],
    },
    select: {
      sessionId: true,
      createdAt: true,
    },
  });

  if (conversation) {
    await prisma.aIAgentConversation.deleteMany({
      where: {
        userId: session.user.id,
        sessionId: conversation.sessionId,
        createdAt: { gte: conversation.createdAt },
      },
    });
    return;
  }

  const [message] = await getMessageById({ id });
  if (!message) {
    throw new Error("Message not found");
  }

  const chat = await getChatById({ id: message.chatId });
  if (!chat || chat.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const sessionRecord = await prisma.session.findFirst({
    where: {
      id: chatId,
      userId: session.user.id,
      sessionType: "AI_AGENT",
    },
  });

  if (!sessionRecord) {
    return;
  }

  const metadata =
    sessionRecord.metadata && typeof sessionRecord.metadata === "object"
      ? (sessionRecord.metadata as Record<string, unknown>)
      : {};

  await prisma.session.update({
    where: { id: sessionRecord.id },
    data: {
      metadata: {
        ...metadata,
        visibility,
      },
    },
  });
}
