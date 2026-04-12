import { auth } from "@/app/(auth)/auth";
import { companionMemory } from "@/mastra/storage";
import { prisma } from "@/lib/prisma";
import { resolveSessionRuntimeInfo } from "@/lib/ai/agent-session-utils";

type PatchUserRequest = {
  name?: string | null;
  image?: string | null;
};

export async function GET() {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: authSession.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      isAnonymous: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          sessions: true,
          conversations: true,
          chats: true,
        },
      },
    },
  });

  if (!user) {
    return Response.json({ error: "user not found" }, { status: 404 });
  }

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
      isAnonymous: user.isAnonymous,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      counts: {
        sessions: user._count.sessions,
        conversations: user._count.conversations,
        chats: user._count.chats,
      },
    },
  });
}

export async function PATCH(req: Request) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as PatchUserRequest | null;
  const hasName = Object.prototype.hasOwnProperty.call(body ?? {}, "name");
  const hasImage = Object.prototype.hasOwnProperty.call(body ?? {}, "image");

  if (!hasName && !hasImage) {
    return Response.json(
      { error: "name or image must be provided" },
      { status: 400 }
    );
  }

  const nextName =
    hasName && typeof body?.name === "string" ? body.name.trim() : body?.name;
  const nextImage =
    hasImage && typeof body?.image === "string" ? body.image.trim() : body?.image;

  if (hasName && nextName !== null && nextName !== undefined && typeof nextName !== "string") {
    return Response.json({ error: "invalid name" }, { status: 400 });
  }

  if (
    hasImage &&
    nextImage !== null &&
    nextImage !== undefined &&
    typeof nextImage !== "string"
  ) {
    return Response.json({ error: "invalid image" }, { status: 400 });
  }

  const updatedUser = await prisma.user.update({
    where: { id: authSession.user.id },
    data: {
      ...(hasName ? { name: nextName && nextName.length > 0 ? nextName : null } : {}),
      ...(hasImage ? { image: nextImage && nextImage.length > 0 ? nextImage : null } : {}),
    },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      isAnonymous: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return Response.json({ user: updatedUser });
}

export async function DELETE() {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (!user) {
    return Response.json({ error: "user not found" }, { status: 404 });
  }

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

  const threadIds = new Set<string>();
  for (const session of sessions) {
    const runtime = resolveSessionRuntimeInfo({
      sessionId: session.id,
      userId,
      metadata: session.metadata,
    });
    threadIds.add(runtime.threadId);
  }

  const deletedThreads: string[] = [];
  const failedThreads: string[] = [];

  await Promise.all(
    Array.from(threadIds).map(async (threadId) => {
      try {
        await companionMemory.deleteThread(threadId);
        deletedThreads.push(threadId);
      } catch {
        failedThreads.push(threadId);
      }
    })
  );

  await prisma.user.delete({
    where: { id: userId },
  });

  return Response.json({
    deleted: true,
    userId,
    sessionsDeleted: sessions.length,
    threadsDeleted: deletedThreads.length,
    threadsDeleteFailed: failedThreads.length,
    ...(failedThreads.length > 0 ? { failedThreadIds: failedThreads } : {}),
  });
}