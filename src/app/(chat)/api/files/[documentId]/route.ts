import { auth } from "@/app/(auth)/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2Object } from "@/lib/cloudflare-r2";
import { NextResponse, after } from "next/server";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const userId = authSession.user.id;
  const { documentId } = await params;

  if (!documentId) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const doc = await prisma.uploadedDocument.findFirst({
    where: { id: documentId, userId },
  });

  if (!doc) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Schedule background cleanup: delete R2 object, DB row, and revalidate
  // the chat page after the HTTP response is sent to keep response fast.
  // retry helper: attempt up to `tries` total, with exponential backoff
  async function retryWithBackoff<T>(
    operation: () => Promise<T>,
    tries = 2,
    initialDelayMs = 200
  ): Promise<T> {
    let attempt = 0;
    let lastErr: unknown;
    while (attempt < tries) {
      try {
        return await operation();
      } catch (err) {
        lastErr = err;
        attempt += 1;
        if (attempt >= tries) break;
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise((res) => setTimeout(res, delay));
      }
    }
    throw lastErr;
  }

  after(async () => {
    try {
      if (doc.r2Key) {
        try {
          await retryWithBackoff(() => deleteR2Object(doc.r2Key), 2, 200);
        } catch (err) {
          console.error("Failed to delete R2 object for document", documentId, err);
        }
      }
    } catch (err) {
      console.error("Unexpected error in R2 cleanup", documentId, err);
    }

    try {
      try {
        await retryWithBackoff(
          () => prisma.uploadedDocument.delete({ where: { id: documentId } }),
          2,
          200
        );
      } catch (err) {
        console.error("Failed to delete uploadedDocument record", documentId, err);
      }
    } catch (err) {
      console.error("Unexpected error deleting DB record", documentId, err);
    }

    try {
      if (doc.sessionId) {
        try {
          revalidatePath(`/chat/${doc.sessionId}`);
        } catch (err) {
          console.error("Failed to revalidate path for session", doc.sessionId, err);
        }
      }
    } catch (err) {
      console.error("Unexpected error during revalidation", doc.sessionId, err);
    }
  });

  // Return immediately; background work will run after response.
  return NextResponse.json({ deleted: true, documentId });
}
