import { auth } from "@/app/(auth)/auth";
import { companionMemory } from "@/mastra/storage";
import { prisma } from "@/lib/prisma";
import {
  resolveSessionRuntimeInfo,
} from "@/lib/ai/agent-session-utils";

type WorkingMemoryBody = {
  workingMemory?: string;
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

  const workingMemory = await companionMemory.getWorkingMemory({
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
  });

  return Response.json({
    sessionId: session.id,
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
    workingMemory,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { sessionId } = await params;
  const body = (await req.json().catch(() => null)) as WorkingMemoryBody | null;
  const workingMemory = typeof body?.workingMemory === "string" ? body.workingMemory : "";

  if (!workingMemory) {
    return Response.json({ error: "workingMemory is required" }, { status: 400 });
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

  await companionMemory.updateWorkingMemory({
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
    workingMemory,
  });

  return Response.json({
    updated: true,
    sessionId: session.id,
    threadId: runtime.threadId,
    resourceId: runtime.resourceId,
  });
}