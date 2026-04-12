import { auth } from "@/app/(auth)/auth";
import { companionMemory } from "@/mastra/storage";
import { prisma } from "@/lib/prisma";
import {
  ensureThreadSynced,
  parseBoolean,
  parsePage,
  parsePositiveInt,
  resolveSessionRuntimeInfo,
} from "@/lib/ai/agent-session-utils";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { sessionId } = await params;
  const { searchParams } = new URL(req.url);

  const page = parsePage(searchParams.get("page"), 0);
  const perPage = Math.min(parsePositiveInt(searchParams.get("perPage"), 40), 200);
  const includeSystemReminders = parseBoolean(
    searchParams.get("includeSystemReminders"),
    false
  );
  const search = searchParams.get("search") ?? undefined;

  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
      sessionType: "AI_AGENT",
    },
  });

  if (!session) {
    return Response.json({ error: "session not found" }, { status: 404 });
  }

  const runtime = resolveSessionRuntimeInfo({
    sessionId: session.id,
    userId,
    metadata: session.metadata,
  });

  const threadSync = await ensureThreadSynced({
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
    title: session.title ?? "Agent Session",
    metadata: {
      sessionId: session.id,
      userId,
      agentType: runtime.agentType,
      status: runtime.metadata.lastStatus ?? "active",
    },
  });

  if (!threadSync.ok) {
    return Response.json(
      {
        error: "thread_sync_failed",
        reason: threadSync.reason,
      },
      { status: 409 }
    );
  }

  const [memoryHistory, conversations, totalConversations] = await Promise.all([
    companionMemory.recall({
      threadId: runtime.threadId,
      resourceId: runtime.resourceId,
      page,
      perPage,
      vectorSearchString: search,
      includeSystemReminders,
    }),
    prisma.aIAgentConversation.findMany({
      where: {
        sessionId: session.id,
        userId,
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: page * perPage,
      take: perPage,
      select: {
        id: true,
        requestId: true,
        agentType: true,
        userMessage: true,
        aiResponse: true,
        status: true,
        inputTokens: true,
        outputTokens: true,
        totalCost: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.aIAgentConversation.count({
      where: {
        sessionId: session.id,
        userId,
      },
    }),
  ]);

  return Response.json({
    session: {
      id: session.id,
      title: session.title,
      metadata: runtime.normalizedMetadata,
    },
    thread: {
      threadId: runtime.threadId,
      resourceId: runtime.resourceId,
      created: threadSync.created,
    },
    memoryHistory,
    conversations,
    pageInfo: {
      page,
      perPage,
      totalConversations,
    },
  });
}