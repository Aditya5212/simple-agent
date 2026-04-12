import { auth } from "@/app/(auth)/auth";
import { prisma } from "@/lib/prisma";
import {
  ALLOWED_SESSION_STATUSES,
  asNonEmptyString,
  ensureThreadSynced,
  resolveSessionRuntimeInfo,
  toPrismaJson,
  type SessionStatus,
} from "@/lib/ai/agent-session-utils";

type UpdateStatusRequest = {
  status?: SessionStatus;
};

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
  const body = (await req.json().catch(() => null)) as UpdateStatusRequest | null;

  const requestedStatus = asNonEmptyString(body?.status);
  if (!requestedStatus || !ALLOWED_SESSION_STATUSES.has(requestedStatus)) {
    return Response.json(
      {
        error: "invalid status",
        allowedStatuses: [...ALLOWED_SESSION_STATUSES],
      },
      { status: 400 }
    );
  }

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

  const nextMetadata = {
    ...runtime.normalizedMetadata,
    lastStatus: requestedStatus,
  };

  const [updatedSession, conversationUpdate] = await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: {
        metadata: toPrismaJson(nextMetadata),
      },
    }),
    requestedStatus === "active"
      ? prisma.aIAgentConversation.updateMany({
          where: {
            sessionId: session.id,
            userId,
            status: {
              in: ["failed", "completed"],
            },
          },
          data: {
            status: "active",
          },
        })
      : prisma.aIAgentConversation.updateMany({
          where: {
            sessionId: session.id,
            userId,
            status: "active",
          },
          data: {
            status: requestedStatus,
          },
        }),
  ]);

  const threadSync = await ensureThreadSynced({
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
    title: updatedSession.title ?? "Agent Session",
    metadata: {
      sessionId: updatedSession.id,
      userId,
      agentType: runtime.agentType,
      status: requestedStatus,
      updatedAt: updatedSession.updatedAt.toISOString(),
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
      title: updatedSession.title,
      metadata: nextMetadata,
      updatedAt: updatedSession.updatedAt,
    },
    updatedConversations: conversationUpdate.count,
    thread: {
      threadId: runtime.threadId,
      resourceId: runtime.resourceId,
      created: threadSync.created,
    },
  });
}