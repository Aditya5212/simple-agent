/**
 * API Docs
 *
 * Route: GET /api/documents/{documentId}/signed-url
 * Purpose: Returns a short-lived signed download URL for a user-owned uploaded document.
 *
 * Auth:
 * - Requires logged-in user session.
 * - Document must belong to the authenticated user.
 *
 * Query params:
 * - expiresInSeconds (optional): 60-3600, defaults to 900.
 *
 * Success response:
 * {
 *   "documentId": "cmdoc123",
 *   "bucket": "my-bucket",
 *   "key": "documents/user_1/file.pdf",
 *   "signedUrl": "https://...",
 *   "expiresInSeconds": 900,
 *   "expiresAt": "2026-04-12T12:00:00.000Z"
 * }
 */

import { auth } from "@/app/(auth)/auth";
import { getR2BucketName, getR2SignedGetUrl } from "@/lib/cloudflare-r2";
import { prisma } from "@/lib/prisma";

const DEFAULT_EXPIRES_IN_SECONDS = 900;

function parseExpiresInSeconds(value: string | null): number {
  if (!value) return DEFAULT_EXPIRES_IN_SECONDS;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_EXPIRES_IN_SECONDS;

  return Math.min(Math.max(parsed, 60), 3600);
}

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export async function GET(req: Request, context: RouteContext) {
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
      filename: true,
      r2Key: true,
      status: true,
      sessionId: true,
    },
  });

  if (!document) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const expiresInSeconds = parseExpiresInSeconds(
    url.searchParams.get("expiresInSeconds")
  );

  const signed = await getR2SignedGetUrl({
    key: document.r2Key,
    fileName: document.filename,
    expiresInSeconds,
  });

  return Response.json({
    documentId: document.id,
    sessionId: document.sessionId,
    status: document.status,
    bucket: getR2BucketName(),
    key: document.r2Key,
    signedUrl: signed.url,
    expiresInSeconds: signed.expiresInSeconds,
    expiresAt: signed.expiresAt,
  });
}
