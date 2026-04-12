/**
 * API Docs
 *
 * Route: POST /api/documents/{documentId}/parse
 * Purpose: Testing-only manual trigger for the unified document ingestion pipeline.
 *
 * Auth:
 * - Requires logged-in user session.
 * - Document must belong to the authenticated user.
 *
 * Request body (optional, testing only):
 * {
 *   "mode": "background" | "inline"
 * }
 */

import { after } from "next/server";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { runDocumentIngestionPipeline } from "@/lib/ingestion/document-pipeline";
import { prisma } from "@/lib/prisma";

const parseRequestSchema = z
  .object({
    mode: z.enum(["background", "inline"]).optional(),
  })
  .strict();

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authSession = await auth();

  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { documentId } = await context.params;

  const document = await prisma.uploadedDocument.findFirst({
    where: {
      id: documentId,
      userId: authSession.user.id,
    },
    select: {
      id: true,
      userId: true,
      filename: true,
      sessionId: true,
      r2Key: true,
      metadata: true,
    },
  });

  if (!document) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  let mode: "background" | "inline" = "background";

  if (request.body !== null) {
    const contentType = request.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const parsedBody = parseRequestSchema.safeParse(await request.json());
      if (!parsedBody.success) {
        return Response.json({ error: "invalid_request_body" }, { status: 400 });
      }
      mode = parsedBody.data.mode ?? "background";
    }
  }

  if (mode === "inline") {
    const result = await runDocumentIngestionPipeline({
      documentId: document.id,
      userId: authSession.user.id,
      trigger: "testing-route",
    });

    return Response.json({
      testingOnly: true,
      mode,
      ...result,
    });
  }

  after(async () => {
    const result = await runDocumentIngestionPipeline({
      documentId: document.id,
      userId: authSession.user.id,
      trigger: "testing-route",
    });

    if (!result.success) {
      console.error("[document-pipeline] testing parse trigger failed", result);
    }
  });

  return Response.json({
    testingOnly: true,
    mode,
    accepted: true,
    documentId: document.id,
    message:
      "Testing trigger accepted. Production flow uses upload-triggered pipeline.",
  });
}
