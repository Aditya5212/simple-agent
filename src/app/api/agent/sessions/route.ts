import { auth } from "@/app/(auth)/auth";
import { prisma } from "@/lib/prisma";
import { companionMemory } from "@/mastra/storage";
import {
  ALLOWED_AGENT_TYPES,
  asNonEmptyString,
  ensureAgentUserRecord,
  ensureThreadSynced,
  parsePositiveInt,
  resolveSessionRuntimeInfo,
  toPrismaJson,
} from "@/lib/ai/agent-session-utils";

type CreateSessionRequest = {
  title?: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(req: Request) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { searchParams } = new URL(req.url);

  const cursor = asNonEmptyString(searchParams.get("cursor"));
  const requestedLimit = parsePositiveInt(searchParams.get("limit"), DEFAULT_LIMIT);
  const limit = Math.min(requestedLimit, MAX_LIMIT);
  const requestedAgentType = asNonEmptyString(searchParams.get("agentType"));

  const sessions = await prisma.session.findMany({
    where: {
      userId,
      sessionType: "AI_AGENT",
      ...(requestedAgentType
        ? {
            metadata: {
              path: ["agentType"],
              equals: requestedAgentType,
            },
          }
        : {}),
    },
    orderBy: {
      updatedAt: "desc",
    },
    ...(cursor
      ? {
          cursor: { id: cursor },
          skip: 1,
        }
      : {}),
    take: limit + 1,
    include: {
      _count: {
        select: {
          conversations: true,
        },
      },
      conversations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          requestId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
        },
      },
    },
  });

  const hasMore = sessions.length > limit;
  const pageSessions = sessions.slice(0, limit);
  const nextCursor = hasMore ? pageSessions[pageSessions.length - 1]?.id ?? null : null;

  const items = await Promise.all(
    pageSessions.map(async (session) => {
    const runtime = resolveSessionRuntimeInfo({
      sessionId: session.id,
      userId,
      metadata: session.metadata,
    });

      const thread = await companionMemory.getThreadById({
        threadId: runtime.threadId,
      });

      const resolvedTitle =
        asNonEmptyString(thread?.title) ??
        asNonEmptyString(session.title) ??
        "Agent Session";

      if (session.title !== resolvedTitle) {
        await prisma.session.update({
          where: { id: session.id },
          data: { title: resolvedTitle },
        });
      }

      return {
        id: session.id,
        sessionType: session.sessionType,
        title: resolvedTitle,
        metadata: runtime.normalizedMetadata,
        thread: {
          threadId: runtime.threadId,
          resourceId: runtime.resourceId,
          title: asNonEmptyString(thread?.title) ?? resolvedTitle,
          metadata: thread?.metadata ?? null,
        },
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        stats: {
          conversationCount: session._count.conversations,
          latestConversation: session.conversations[0] ?? null,
        },
      };
    })
  );

  return Response.json({
    items,
    pageInfo: {
      limit,
      hasMore,
      nextCursor,
    },
  });
}

export async function POST(req: Request) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  await ensureAgentUserRecord({
    userId,
    email: authSession.user.email,
    name: authSession.user.name,
    image: authSession.user.image,
    userType: authSession.user.type,
  });

  const body = (await req.json().catch(() => null)) as CreateSessionRequest | null;

  const requestedAgentType =
    asNonEmptyString(body?.agentType) ?? "simple-agent";

  if (!ALLOWED_AGENT_TYPES.has(requestedAgentType)) {
    return Response.json(
      {
        error: "unsupported agentType",
        supportedAgentTypes: [...ALLOWED_AGENT_TYPES],
      },
      { status: 400 }
    );
  }

  const title = asNonEmptyString(body?.title) ?? null;
  const customMetadata =
    body?.metadata && typeof body.metadata === "object" ? body.metadata : {};

  let session = await prisma.session.create({
    data: {
      userId,
      sessionType: "AI_AGENT",
      title,
      metadata: toPrismaJson({
        ...customMetadata,
        agentType: requestedAgentType,
      }),
    },
  });

  const runtime = resolveSessionRuntimeInfo({
    sessionId: session.id,
    userId,
    metadata: session.metadata,
    fallbackAgentType: requestedAgentType,
  });

  const finalMetadata = {
    ...runtime.normalizedMetadata,
    lastStatus: "active",
  };

  session = await prisma.session.update({
    where: { id: session.id },
    data: {
      metadata: toPrismaJson(finalMetadata),
    },
  });

  const threadSync = await ensureThreadSynced({
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
    title: session.title ?? "Agent Session",
    metadata: {
      sessionId: session.id,
      userId,
      agentType: runtime.agentType,
      status: "active",
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

  return Response.json(
    {
      session: {
        id: session.id,
        sessionType: session.sessionType,
        title: session.title,
        metadata: finalMetadata,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      },
      thread: {
        threadId: runtime.threadId,
        resourceId: runtime.resourceId,
        created: threadSync.created,
      },
    },
    { status: 201 }
  );
}