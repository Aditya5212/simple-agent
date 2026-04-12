import { auth } from "@/app/(auth)/auth";
import { prisma } from "@/lib/prisma";
import { companionMemory } from "@/mastra/storage";
import {
  asNonEmptyString,
  asObject,
  ensureThreadSynced,
  resolveSessionRuntimeInfo,
  toPrismaJson,
} from "@/lib/ai/agent-session-utils";

type UpdateSessionRequest = {
  title?: string;
  metadata?: Record<string, unknown>;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { sessionId } = await params;

  let session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
      sessionType: "AI_AGENT",
    },
    include: {
      _count: {
        select: {
          conversations: true,
        },
      },
      conversations: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
        select: {
          id: true,
          requestId: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          inputTokens: true,
          outputTokens: true,
        },
      },
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

  const latestConversation = session.conversations[0] ?? null;
  const metadataWithStatus = {
    ...runtime.normalizedMetadata,
    lastStatus:
      (typeof runtime.metadata.lastStatus === "string" && runtime.metadata.lastStatus) ||
      latestConversation?.status ||
      "active",
  };

  const existingMetadata = asObject(session.metadata);
  if (JSON.stringify(existingMetadata) !== JSON.stringify(metadataWithStatus)) {
    session = await prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: toPrismaJson(metadataWithStatus),
      },
      include: {
        _count: {
          select: {
            conversations: true,
          },
        },
        conversations: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            requestId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            inputTokens: true,
            outputTokens: true,
          },
        },
      },
    });
  }

  const threadSync = await ensureThreadSynced({
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
    title: session.title ?? "Agent Session",
    metadata: {
      sessionId: session.id,
      userId,
      agentType: runtime.agentType,
      status: metadataWithStatus.lastStatus,
      updatedAt: session.updatedAt.toISOString(),
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

  const thread = await companionMemory.getThreadById({
    threadId: runtime.threadId,
  });

  const resolvedTitle =
    asNonEmptyString(thread?.title) ??
    asNonEmptyString(session.title) ??
    "Agent Session";

  if (session.title !== resolvedTitle) {
    session = await prisma.session.update({
      where: { id: session.id },
      data: { title: resolvedTitle },
      include: {
        _count: {
          select: {
            conversations: true,
          },
        },
        conversations: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          select: {
            id: true,
            requestId: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            inputTokens: true,
            outputTokens: true,
          },
        },
      },
    });
  }

  return Response.json({
    session: {
      id: session.id,
      sessionType: session.sessionType,
      title: resolvedTitle,
      metadata: metadataWithStatus,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
    thread: {
      threadId: runtime.threadId,
      resourceId: runtime.resourceId,
      title: asNonEmptyString(thread?.title) ?? resolvedTitle,
      metadata: thread?.metadata ?? null,
      created: threadSync.created,
    },
    stats: {
      conversationCount: session._count.conversations,
      latestConversation: session.conversations[0] ?? null,
    },
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { sessionId } = await params;
  const body = (await req.json().catch(() => null)) as UpdateSessionRequest | null;

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

  const requestedTitle = asNonEmptyString(body?.title);
  const metadataPatch =
    body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined;

  if (!requestedTitle && !metadataPatch) {
    return Response.json(
      { error: "title or metadata is required" },
      { status: 400 }
    );
  }

  const patchedMetadata = {
    ...runtime.metadata,
    ...(metadataPatch ?? {}),
  };

  const nextRuntime = resolveSessionRuntimeInfo({
    sessionId: session.id,
    userId,
    metadata: patchedMetadata,
    fallbackAgentType: runtime.agentType,
  });

  const nextTitle = requestedTitle ?? asNonEmptyString(session.title) ?? "Agent Session";

  const updatedSession = await prisma.session.update({
    where: { id: session.id },
    data: {
      title: nextTitle,
      metadata: toPrismaJson(nextRuntime.normalizedMetadata),
    },
  });

  const threadSync = await ensureThreadSynced({
    threadId: nextRuntime.threadId,
    resourceId: nextRuntime.resourceId,
    title: nextTitle,
    metadata: {
      sessionId: updatedSession.id,
      userId,
      agentType: nextRuntime.agentType,
      status: nextRuntime.metadata.lastStatus ?? "active",
      updatedAt: updatedSession.updatedAt.toISOString(),
      ...(metadataPatch ?? {}),
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

  return Response.json({
    session: {
      id: updatedSession.id,
      sessionType: updatedSession.sessionType,
      title: updatedSession.title,
      metadata: nextRuntime.normalizedMetadata,
      createdAt: updatedSession.createdAt,
      updatedAt: updatedSession.updatedAt,
    },
    thread: {
      threadId: nextRuntime.threadId,
      resourceId: nextRuntime.resourceId,
      created: threadSync.created,
    },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { sessionId } = await params;

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

  const thread = await companionMemory.getThreadById({
    threadId: runtime.threadId,
  });

  if (thread && thread.resourceId !== runtime.resourceId) {
    return Response.json(
      {
        error: "thread_resource_mismatch",
        threadId: runtime.threadId,
      },
      { status: 409 }
    );
  }

  await prisma.session.delete({
    where: { id: session.id },
  });

  let threadDeleted = false;
  let warning: string | undefined;

  if (thread) {
    try {
      await companionMemory.deleteThread(runtime.threadId);
      threadDeleted = true;
    } catch {
      warning = "session deleted but thread deletion failed";
    }
  }

  return Response.json({
    deleted: true,
    sessionId: session.id,
    threadId: runtime.threadId,
    threadDeleted,
    ...(warning ? { warning } : {}),
  });
}