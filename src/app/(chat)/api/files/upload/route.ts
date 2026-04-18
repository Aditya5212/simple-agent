import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { auth } from "@/app/(auth)/auth";
import {
  deleteR2Object,
  getR2BucketName,
  getR2PublicUrl,
  getR2SignedGetUrl,
  putR2Object,
} from "@/lib/cloudflare-r2";
import {
  isDocumentPipelineAutoStartEnabled,
} from "@/lib/ingestion/document-pipeline";
import { ingestionQueue } from "@/lib/queues/ingestion.queue";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const uploadBodySchema = z.object({
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE_BYTES, {
      message: "File size should be less than or equal to 20MB",
    })
    .refine((file) => ALLOWED_MIME_TYPES.has(file.type), {
      message: "Unsupported file type",
    }),
});

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function getFolderFromMime(mimeType: string): "images" | "documents" {
  return mimeType.startsWith("image/") ? "images" : "documents";
}

function asOptionalNonEmptyString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: Request) {
  const authSession = await auth();

  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (request.body === null) {
    return new Response("Request body is empty", { status: 400 });
  }

  try {
    const formData = await request.formData();
    const fileValue = formData.get("file");
    const file = fileValue instanceof Blob ? fileValue : null;

    if (!file) {
      return Response.json({ error: "no_file_uploaded" }, { status: 400 });
    }

    const validatedFile = uploadBodySchema.safeParse({ file });

    if (!validatedFile.success) {
      const errorMessage = validatedFile.error.issues
        .map((error) => error.message)
        .join(", ");

      return Response.json({ error: errorMessage }, { status: 400 });
    }

    const fileAsFile = fileValue as File;
    const filename = fileAsFile.name || "upload.bin";
    const sessionId = asOptionalNonEmptyString(formData.get("sessionId"));

    // Enforce that uploads must be associated with an existing session.
    // Per project flow: uploads must be performed within a created session.
    if (!sessionId) {
      return Response.json(
        {
          error: "session_required",
          message:
            "Uploads must be associated with an existing session. Create a session before uploading.",
        },
        { status: 400 }
      );
    }

    const session = await prisma.session.findFirst({
      where: {
        id: sessionId,
        userId: authSession.user.id,
      },
      select: { id: true, sessionType: true },
    });

    if (!session || session.sessionType !== "AI_AGENT") {
      return Response.json(
        {
          error: "invalid_session_id",
          message:
            "Session not found or invalid for this user. Uploads must be tied to an existing AI session.",
        },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(filename);
    const objectFolder = getFolderFromMime(file.type);
    const key = `${objectFolder}/${authSession.user.id}/${Date.now()}-${randomUUID()}-${safeName}`;
    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const checksum = createHash("sha256").update(fileBuffer).digest("hex");

    const upload = await putR2Object({
      key,
      Body: fileBuffer,
      ContentType: file.type,
      CacheControl: objectFolder === "images" ? "public, max-age=31536000, immutable" : "private, no-store",
      Metadata: {
        userId: authSession.user.id,
        originalName: filename,
      },
    });

    try {
      const document = await prisma.uploadedDocument.create({
        data: {
          userId: authSession.user.id,
          sessionId,
          filename,
          mimeType: file.type,
          sizeBytes: file.size,
          r2Key: key,
          checksum,
          status: "queued",
          metadata: {
            bucket: getR2BucketName(),
            etag: upload.etag,
            versionId: upload.versionId,
            folder: objectFolder,
          },
        },
      });

      const ingestionJob = await prisma.ingestionJob.create({
        data: {
          documentId: document.id,
          userId: authSession.user.id,
          status: "queued",
          phase: "upload",
          metadata: {
            source: "api.files.upload",
          },
        },
      });

      const shouldAutoStartPipeline =
        objectFolder === "documents" && isDocumentPipelineAutoStartEnabled();

      if (shouldAutoStartPipeline) {
        try {
          await ingestionQueue.add(
            "ingest",
            {
              ingestionJobId: ingestionJob.id,
              documentId: document.id,
              userId: authSession.user.id,
              trigger: "upload-auto",
            },
            {
              // Keep BullMQ id aligned with DB job id to preserve statusUrl semantics.
              jobId: ingestionJob.id,
            }
          );
        } catch (err) {
          console.error("Failed to enqueue ingestion job:", err);

          // Best-effort cleanup: remove uploaded object and DB records created above.
          try {
            await deleteR2Object(key);
          } catch (_cleanupError) {
            // ignore
          }

          try {
            await prisma.uploadedDocument.delete({ where: { id: document.id } });
          } catch (_e) {
            // ignore
          }

          try {
            await prisma.ingestionJob.delete({ where: { id: ingestionJob.id } });
          } catch (_e) {
            // ignore
          }

          return Response.json(
            {
              error: "ingestion_enqueue_failed",
              message:
                "Failed to enqueue ingestion job. Check REDIS_URL and Redis authentication/availability.",
              detail: err instanceof Error ? err.message : String(err),
            },
            { status: 502 }
          );
        }
      }

      const publicUrl = getR2PublicUrl(key);
      const shouldPreferSignedUrl = objectFolder === "images";
      const signedDownload = shouldPreferSignedUrl || !publicUrl
        ? await getR2SignedGetUrl({
            key,
            fileName: shouldPreferSignedUrl ? undefined : filename,
            expiresInSeconds: 900,
          })
        : null;
      const resolvedUrl = shouldPreferSignedUrl
        ? signedDownload?.url ?? publicUrl
        : publicUrl;

      return Response.json({
        provider: "r2",
        bucket: getR2BucketName(),
        key,
        url: resolvedUrl,
        signedUrl: signedDownload?.url ?? null,
        signedUrlExpiresAt: signedDownload?.expiresAt ?? null,
        filename,
        contentType: file.type,
        size: file.size,
        checksum,
        etag: upload.etag,
        versionId: upload.versionId,
        document: {
          id: document.id,
          status: document.status,
          userId: document.userId,
          sessionId: document.sessionId,
          createdAt: document.createdAt,
        },
        ingestionJob: {
          id: ingestionJob.id,
          status: ingestionJob.status,
          phase: ingestionJob.phase,
          attempt: ingestionJob.attempt,
          createdAt: ingestionJob.createdAt,
          statusUrl: `/api/ingestion/jobs/${ingestionJob.id}`,
        },
        pipeline: {
          autoStartEnabled: shouldAutoStartPipeline,
          mode: shouldAutoStartPipeline
            ? "bullmq_enqueued"
            : "manual_only",
        },
      });
    } catch (_dbError) {
      try {
        await deleteR2Object(key);
      } catch (_cleanupError) {
        // Best-effort cleanup.
      }

      return Response.json({ error: "upload_metadata_persist_failed" }, { status: 500 });
    }
  } catch (_error) {
    return Response.json({ error: "upload_failed" }, { status: 500 });
  }
}
