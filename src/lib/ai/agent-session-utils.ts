import { companionMemory } from "@/mastra/storage";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export const ALLOWED_AGENT_TYPES = new Set([
  "simple-agent",
  "simple-agent-gemini-flash",
  "simple-agent-gemini-pro",
  "simple-agent-gemini-lite",
]);
export const ALLOWED_SESSION_STATUSES = new Set(["active", "completed", "failed"]);

export type SessionStatus = "active" | "completed" | "failed";

export type SessionRuntimeInfo = {
  metadata: Record<string, unknown>;
  normalizedMetadata: Record<string, unknown>;
  threadId: string;
  resourceId: string;
  agentType: string;
};

export function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toPrismaJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function resolveSessionRuntimeInfo(params: {
  sessionId: string;
  userId: string;
  metadata: unknown;
  fallbackAgentType?: string;
}) {
  const { sessionId, userId, metadata, fallbackAgentType = "simple-agent" } = params;

  const metadataObj = asObject(metadata);
  // Canonical mapping: thread/resource are always derived from user + session.
  const threadId = `${userId}-${sessionId}`;
  const resourceId = `${sessionId}-${userId}`;
  const agentType = asNonEmptyString(metadataObj.agentType) ?? fallbackAgentType;

  const normalizedMetadata: Record<string, unknown> = {
    ...metadataObj,
    sessionId,
    threadId,
    resourceId,
    agentType,
  };

  return {
    metadata: metadataObj,
    normalizedMetadata,
    threadId,
    resourceId,
    agentType,
  } satisfies SessionRuntimeInfo;
}

export async function ensureThreadSynced(params: {
  threadId: string;
  resourceId: string;
  title?: string | null;
  metadata: Record<string, unknown>;
}) {
  const { threadId, resourceId, title, metadata } = params;
  const safeTitle = asNonEmptyString(title) ?? "Agent Session";

  const existingThread = await companionMemory.getThreadById({ threadId });

  if (!existingThread) {
    const createdThread = await companionMemory.createThread({
      threadId,
      resourceId,
      title: safeTitle,
      metadata,
      saveThread: true,
    });

    return {
      ok: true,
      created: true,
      threadId: createdThread.id,
      resourceId,
    } as const;
  }

  if (existingThread.resourceId !== resourceId) {
    return {
      ok: false,
      reason: "thread_resource_mismatch",
      threadId,
      expectedResourceId: resourceId,
      actualResourceId: existingThread.resourceId,
    } as const;
  }

  await companionMemory.updateThread({
    id: threadId,
    title: safeTitle,
    metadata,
  });

  return {
    ok: true,
    created: false,
    threadId,
    resourceId,
  } as const;
}

export function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return fallback;
  return Math.floor(parsed);
}

export function parsePage(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < 0) return fallback;
  return Math.floor(parsed);
}

export function parseBoolean(value: string | null, fallback: boolean) {
  if (!value) return fallback;
  return value === "true" || value === "1";
}

export async function syncSessionTitleForThread(params: {
  threadId: string;
  title: string;
}) {
  const { threadId, title } = params;
  const safeTitle = asNonEmptyString(title);
  if (!safeTitle) {
    return { updated: 0 } as const;
  }

  const result = await prisma.session.updateMany({
    where: {
      sessionType: "AI_AGENT",
      metadata: {
        path: ["threadId"],
        equals: threadId,
      },
    },
    data: {
      title: safeTitle,
    },
  });

  return { updated: result.count } as const;
}

export async function ensureAgentUserRecord(params: {
  userId: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  userType?: string;
}) {
  const { userId, email, name, image, userType } = params;

  const existingById = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (existingById) {
    return { created: false as const };
  }

  const providedEmail = asNonEmptyString(email);
  const fallbackEmail = `restored-${userId}`;
  let candidateEmail = providedEmail ?? fallbackEmail;

  const existingByEmail = await prisma.user.findUnique({
    where: { email: candidateEmail },
    select: { id: true },
  });

  if (existingByEmail && existingByEmail.id !== userId) {
    candidateEmail = `${fallbackEmail}-${Date.now()}`;
  }

  await prisma.user.create({
    data: {
      id: userId,
      email: candidateEmail,
      name: asNonEmptyString(name) ?? null,
      image: asNonEmptyString(image) ?? null,
      isAnonymous: userType === "guest",
    },
  });

  return { created: true as const };
}