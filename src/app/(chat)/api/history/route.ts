import { auth } from "@/app/(auth)/auth";
import { companionMemory } from "@/mastra/storage";
import { prisma } from "@/lib/prisma";
import { ChatbotError } from "@/lib/errors";
import { resolveSessionRuntimeInfo } from "@/lib/ai/agent-session-utils";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = Math.min(
    Math.max(Number.parseInt(searchParams.get("limit") || "10", 10), 1),
    50
  );
  const startingAfter = searchParams.get("starting_after");
  const endingBefore = searchParams.get("ending_before");

  if (startingAfter && endingBefore) {
    return new ChatbotError(
      "bad_request:api",
      "Only one of starting_after or ending_before can be provided."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const userId = session.user.id;

  const baseWhere = {
    userId,
    sessionType: "AI_AGENT",
  } as const;

  const query = (whereCondition?: { createdAt: Record<string, Date> }) =>
    prisma.session.findMany({
      where: {
        ...baseWhere,
        ...(whereCondition ?? {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

  let sessions = [] as Awaited<ReturnType<typeof query>>;

  if (startingAfter) {
    const selectedSession = await prisma.session.findFirst({
      where: { id: startingAfter, ...baseWhere },
    });

    if (!selectedSession) {
      return new ChatbotError(
        "not_found:database",
        `Session with id ${startingAfter} not found`
      ).toResponse();
    }

    sessions = await query({ createdAt: { gt: selectedSession.createdAt } });
  } else if (endingBefore) {
    const selectedSession = await prisma.session.findFirst({
      where: { id: endingBefore, ...baseWhere },
    });

    if (!selectedSession) {
      return new ChatbotError(
        "not_found:database",
        `Session with id ${endingBefore} not found`
      ).toResponse();
    }

    sessions = await query({ createdAt: { lt: selectedSession.createdAt } });
  } else {
    sessions = await query();
  }

  const hasMore = sessions.length > limit;
  const pageSessions = hasMore ? sessions.slice(0, limit) : sessions;

  const chats = pageSessions.map((currentSession) => {
    const metadata =
      currentSession.metadata && typeof currentSession.metadata === "object"
        ? (currentSession.metadata as Record<string, unknown>)
        : {};
    const visibility =
      metadata.visibility === "public" ? "public" : "private";

    return {
    id: currentSession.id,
    createdAt: currentSession.createdAt,
    title: currentSession.title ?? "New chat",
    userId,
    visibility: visibility as "private" | "public",
  };
  });

  return Response.json({ chats, hasMore });
}

export async function DELETE() {
  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:chat").toResponse();
  }

  const userId = session.user.id;
  const sessions = await prisma.session.findMany({
    where: {
      userId,
      sessionType: "AI_AGENT",
    },
    select: {
      id: true,
      metadata: true,
    },
  });

  if (sessions.length === 0) {
    return Response.json({ deletedCount: 0, threadDeletedCount: 0 });
  }

  const threadIds = sessions.map((currentSession) =>
    resolveSessionRuntimeInfo({
      sessionId: currentSession.id,
      userId,
      metadata: currentSession.metadata,
    }).threadId
  );

  const deleted = await prisma.session.deleteMany({
    where: {
      userId,
      sessionType: "AI_AGENT",
    },
  });

  const deleteResults = await Promise.allSettled(
    threadIds.map(async (threadId) => {
      await companionMemory.deleteThread(threadId);
      return threadId;
    })
  );

  const threadDeletedCount = deleteResults.filter(
    (result) => result.status === "fulfilled"
  ).length;

  return Response.json(
    {
      deletedCount: deleted.count,
      threadDeletedCount,
    },
    { status: 200 }
  );
}
