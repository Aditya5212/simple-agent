import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { retrieveDocumentContext } from "@/lib/ingestion/document-pipeline";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({
  query: z.string().trim().min(1).max(4000),
  topK: z.number().int().positive().max(30).optional(),
  // `documentIds` may be supplied by the agent to narrow retrieval to specific
  // documents the user explicitly referenced. Do NOT accept user/session IDs
  // or any flags that affect security scope — those must come from requestContext.
  documentIds: z.array(z.string().trim().min(1).max(128)).max(20).optional(),
});

const outputSchema = z.object({
  success: z.boolean(),
  query: z.string(),
  topK: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  context: z.string(),
  citations: z.array(
    z.object({
      vectorId: z.string(),
      score: z.number().nullable(),
      documentId: z.string().nullable(),
      filename: z.string().nullable(),
      chunkIndex: z.number().int().nullable(),
    })
  ),
  filters: z.object({
    userId: z.string().nullable(),
    sessionId: z.string().nullable(),
    documentIds: z.array(z.string()),
  }),
  fallbackUsed: z.boolean().optional(),
  message: z.string().optional(),
});

type SessionDiagnostics = {
  queued: number;
  processing: number;
  ready: number;
  failed: number;
  latestFailure: string | null;
};

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

async function getSessionDiagnostics(
  userId: string,
  sessionId: string
): Promise<SessionDiagnostics> {
  const [queued, processing, ready, failed, latestFailedDoc] = await Promise.all([
    prisma.uploadedDocument.count({
      where: { userId, sessionId, status: "queued" },
    }),
    prisma.uploadedDocument.count({
      where: { userId, sessionId, status: "processing" },
    }),
    prisma.uploadedDocument.count({
      where: { userId, sessionId, status: "ready" },
    }),
    prisma.uploadedDocument.count({
      where: { userId, sessionId, status: "failed" },
    }),
    prisma.uploadedDocument.findFirst({
      where: {
        userId,
        sessionId,
        status: "failed",
      },
      select: {
        errorMessage: true,
      },
      orderBy: {
        updatedAt: "desc",
      },
    }),
  ]);

  return {
    queued,
    processing,
    ready,
    failed,
    latestFailure:
      typeof latestFailedDoc?.errorMessage === "string" &&
      latestFailedDoc.errorMessage.trim().length > 0
        ? latestFailedDoc.errorMessage
        : null,
  };
}

// resolveUserId removed: userId/sessionId must come from requestContext (server-trusted)

export const similaritySearchDocumentsTool = createTool({
  id: "similarity-search-documents",
  description:
    "Runs semantic similarity search over uploaded document chunks. Use this when user asks to find relevant passages from uploaded docs.",
  inputSchema,
  outputSchema,
  requestContextSchema: z.object({
    userId: z.string().min(1),
    sessionId: z.string().min(1),
  }),
  execute: async (input, context) => {
    const normalizedDocumentIds = (input.documentIds ?? []).filter(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    const requestContext = context?.requestContext;
    const userId = normalizeOptionalString(requestContext?.get("userId"));
    const sessionId = normalizeOptionalString(requestContext?.get("sessionId"));

    if (!userId || !sessionId) {
      return {
        success: false,
        query: input.query,
        topK: input.topK ?? 0,
        count: 0,
        context: "",
        citations: [],
        filters: {
          userId: userId ?? null,
          sessionId: sessionId ?? null,
          documentIds: normalizedDocumentIds,
        },
        message: "Missing request context: userId and sessionId are required.",
      };
    }

    const result = await retrieveDocumentContext({
      userId,
      query: input.query,
      topK: input.topK,
      sessionId,
      documentIds: normalizedDocumentIds,
    });

    if (result.matches.length === 0) {
      const diagnostics = await getSessionDiagnostics(userId, sessionId);

      const message =
        diagnostics.ready === 0
          ? `No indexed documents are ready for this session yet. queued=${diagnostics.queued}, processing=${diagnostics.processing}, failed=${diagnostics.failed}.` +
            (diagnostics.latestFailure ? ` Latest failure: ${diagnostics.latestFailure}` : "")
          : "No relevant matches found for the provided scope. Try a more specific query, or pass documentIds to narrow retrieval.";

      return {
        success: true,
        query: input.query,
        topK: result.topK,
        count: 0,
        context: "",
        citations: [],
        filters: {
          userId,
          sessionId,
          documentIds: normalizedDocumentIds,
        },
        message,
      };
    }

    return {
      success: true,
      query: input.query,
      topK: result.topK,
      count: result.matches.length,
      context: result.context,
      citations: result.citations.map((citation) => ({
        vectorId: citation.vectorId,
        score: typeof citation.score === "number" ? citation.score : null,
        documentId: citation.documentId ?? null,
        filename: citation.filename ?? null,
        chunkIndex: typeof citation.chunkIndex === "number" ? citation.chunkIndex : null,
      })),
      filters: {
        userId,
        sessionId,
        documentIds: normalizedDocumentIds,
      },
      message: undefined,
    };
  },
});
