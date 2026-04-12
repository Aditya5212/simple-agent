/**
 * API Docs
 *
 * Route: GET /api/ingestion/jobs/{jobId}
 * Purpose: Frontend-friendly ingestion status endpoint for upload processing.
 *
 * Auth:
 * - Requires logged-in user session.
 * - Ingestion job must belong to the authenticated user.
 */

import { auth } from "@/app/(auth)/auth";
import { prisma } from "@/lib/prisma";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNestedString(value: unknown, keys: string[]): string | null {
  let current: unknown = value;

  for (const key of keys) {
    const objectValue = asObject(current);
    current = objectValue[key];
  }

  return asNonEmptyString(current);
}

function readParseJobId(metadata: unknown): string | null {
  return (
    getNestedString(metadata, ["parseJobId"]) ??
    getNestedString(metadata, ["parser", "parseJobId"])
  );
}

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const authSession = await auth();

  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;

  const job = await prisma.ingestionJob.findFirst({
    where: {
      id: jobId,
      userId: authSession.user.id,
    },
    select: {
      id: true,
      documentId: true,
      userId: true,
      status: true,
      phase: true,
      attempt: true,
      errorMessage: true,
      metadata: true,
      startedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      document: {
        select: {
          id: true,
          sessionId: true,
          filename: true,
          mimeType: true,
          status: true,
          errorMessage: true,
          updatedAt: true,
        },
      },
    },
  });

  if (!job) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const pipeline = asObject(job.metadata).pipeline;
  const pipelineObject = asObject(pipeline);

  return Response.json(
    {
      ingestionJob: {
        id: job.id,
        documentId: job.documentId,
        status: job.status,
        phase: job.phase,
        attempt: job.attempt,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
      document: {
        id: job.document.id,
        sessionId: job.document.sessionId,
        filename: job.document.filename,
        mimeType: job.document.mimeType,
        status: job.document.status,
        errorMessage: job.document.errorMessage,
        updatedAt: job.document.updatedAt,
      },
      parser: {
        parseJobId: readParseJobId(job.metadata),
      },
      pipeline: {
        state: asNonEmptyString(pipelineObject.state),
        trigger: asNonEmptyString(pipelineObject.trigger),
        failedPhase: asNonEmptyString(pipelineObject.failedPhase),
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
