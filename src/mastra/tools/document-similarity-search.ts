import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { retrieveDocumentContext } from "@/lib/ingestion/document-pipeline";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({
  query: z.string().trim().min(1).max(4000),
  topK: z.number().int().positive().max(30).optional(),
  userId: z.string().trim().min(1).max(128).optional(),
  sessionId: z.string().trim().min(1).max(128).optional(),
  documentIds: z.array(z.string().trim().min(1).max(128)).max(100).optional(),
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

async function resolveUserId(input: z.infer<typeof inputSchema>) {
  const explicitUserId = input.userId?.trim();
  if (explicitUserId) {
    return explicitUserId;
  }

  const documentIds = (input.documentIds ?? []).filter(Boolean);
  if (documentIds.length > 0) {
    const fromDocument = await prisma.uploadedDocument.findFirst({
      where: {
        id: { in: documentIds },
      },
      select: {
        userId: true,
      },
    });

    if (fromDocument?.userId) {
      return fromDocument.userId;
    }
  }

  const sessionId = input.sessionId?.trim();
  if (sessionId) {
    const fromSession = await prisma.session.findFirst({
      where: {
        id: sessionId,
      },
      select: {
        userId: true,
      },
    });

    if (fromSession?.userId) {
      return fromSession.userId;
    }
  }

  return null;
}

export const similaritySearchDocumentsTool = createTool({
  id: "similarity-search-documents",
  description:
    "Runs semantic similarity search over uploaded document chunks. Use this when user asks to find relevant passages from uploaded docs.",
  inputSchema,
  outputSchema,
  execute: async (input, context) => {
    const normalizedDocumentIds = (input.documentIds ?? []).filter(
      (value) => typeof value === "string" && value.trim().length > 0
    );

    const requestContext = context?.requestContext;
    const scopedUserId = normalizeOptionalString(requestContext?.get("userId"));
    const scopedSessionId = normalizeOptionalString(requestContext?.get("sessionId"));

    const userId = scopedUserId ?? (await resolveUserId(input));
    const effectiveSessionId = scopedSessionId ?? input.sessionId?.trim();

    if (!userId) {
      return {
        success: false,
        query: input.query,
        topK: input.topK ?? 0,
        count: 0,
        context: "",
        citations: [],
        filters: {
          userId: null,
          sessionId: effectiveSessionId ?? null,
          documentIds: normalizedDocumentIds,
        },
        fallbackUsed: false,
        message:
          "Missing search scope. User context is required for retrieval.",
      };
    }

    const primaryResult = await retrieveDocumentContext({
      userId,
      query: input.query,
      topK: input.topK,
      sessionId: effectiveSessionId,
      documentIds: normalizedDocumentIds,
    });

    const shouldFallbackToUserScope =
      primaryResult.matches.length === 0 &&
      typeof effectiveSessionId === "string" &&
      effectiveSessionId.length > 0 &&
      normalizedDocumentIds.length === 0;

    let result = primaryResult;
    let fallbackUsed = false;

    if (shouldFallbackToUserScope) {
      const fallbackResult = await retrieveDocumentContext({
        userId,
        query: input.query,
        topK: input.topK,
      });

      if (fallbackResult.matches.length > 0) {
        result = fallbackResult;
        fallbackUsed = true;
      }
    }

    let message: string | undefined;

    if (result.matches.length === 0) {
      if (effectiveSessionId?.trim()) {
        const diagnostics = await getSessionDiagnostics(userId, effectiveSessionId.trim());

        if (diagnostics.ready === 0) {
          message =
            `No indexed documents are ready for this session yet. ` +
            `queued=${diagnostics.queued}, processing=${diagnostics.processing}, failed=${diagnostics.failed}.` +
            (diagnostics.latestFailure
              ? ` Latest failure: ${diagnostics.latestFailure}`
              : "");
        } else {
          message =
            "No relevant matches found for the provided scope. Try a more specific query, or pass documentIds to narrow retrieval.";
        }
      } else {
        message =
          "No relevant matches found. Try a more specific query or provide sessionId/documentIds to narrow retrieval.";
      }
    } else if (fallbackUsed) {
      message =
        "No matches were found in the provided session scope, so results were returned from your broader user document scope.";
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
        chunkIndex:
          typeof citation.chunkIndex === "number" ? citation.chunkIndex : null,
      })),
      filters: {
        userId,
        sessionId: fallbackUsed ? null : effectiveSessionId ?? null,
        documentIds: normalizedDocumentIds,
      },
      fallbackUsed,
      message,
    };
  },
});
