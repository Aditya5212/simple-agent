/**
 * API Docs
 *
 * Route: POST /api/rag/retrieve
 * Purpose: Retrieves relevant document chunks from Mastra PgVector for RAG.
 *
 * Auth:
 * - Requires logged-in user session.
 * - Retrieval is always scoped to the authenticated user.
 */

import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import { retrieveDocumentContext } from "@/lib/ingestion/document-pipeline";

const retrieveBodySchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    topK: z.number().int().positive().max(30).optional(),
    sessionId: z.string().trim().min(1).max(128),
    documentIds: z.array(z.string().trim().min(1).max(128)).max(20).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const authSession = await auth();

  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = retrieveBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "invalid_request_body" }, { status: 400 });
  }

  try {
    // Require `sessionId` to be present in requests — retrieval is session-scoped.
    if (!parsed.data.sessionId) {
      return Response.json(
        {
          error: "missing_session_scope",
          message:
            "Retrieval requests must include `sessionId` to scope results to that session.",
        },
        { status: 400 }
      );
    }

    const result = await retrieveDocumentContext({
      userId: authSession.user.id,
      query: parsed.data.query,
      topK: parsed.data.topK,
      sessionId: parsed.data.sessionId,
      documentIds: parsed.data.documentIds,
    });

    return Response.json({
      query: parsed.data.query,
      topK: result.topK,
      context: result.context,
      citations: result.citations,
      count: result.matches.length,
    });
  } catch {
    return Response.json({ error: "rag_retrieval_failed" }, { status: 500 });
  }
}
