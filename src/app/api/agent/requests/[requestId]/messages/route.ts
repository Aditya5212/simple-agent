import { auth } from "@/app/(auth)/auth";
import { companionMemory } from "@/mastra/storage";
import { prisma } from "@/lib/prisma";
import {
  resolveSessionRuntimeInfo,
} from "@/lib/ai/agent-session-utils";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { requestId } = await params;

  const conversation = await prisma.aIAgentConversation.findFirst({
    where: {
      requestId,
      userId,
    },
    include: {
      session: true,
    },
  });

  if (!conversation) {
    return Response.json({ error: "request not found" }, { status: 404 });
  }

  const runtime = resolveSessionRuntimeInfo({
    sessionId: conversation.session.id,
    userId,
    metadata: conversation.session.metadata,
    fallbackAgentType: conversation.agentType,
  });

  const thread = await companionMemory.getThreadById({
    threadId: runtime.threadId,
  });

  return Response.json({
    request: {
      requestId: conversation.requestId,
      conversationId: conversation.id,
      status: conversation.status,
      agentType: conversation.agentType,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    },
    session: {
      id: conversation.session.id,
      title: conversation.session.title,
      metadata: runtime.normalizedMetadata,
      thread: {
        threadId: runtime.threadId,
        resourceId: runtime.resourceId,
        title: thread?.title ?? null,
        metadata: thread?.metadata ?? null,
      },
    },
    messages: {
      userMessage: conversation.userMessage,
      aiResponse: conversation.aiResponse,
    },
    usage: {
      inputTokens: conversation.inputTokens,
      outputTokens: conversation.outputTokens,
      totalCost: conversation.totalCost,
    },
    metadata: conversation.metadata,
  });
}