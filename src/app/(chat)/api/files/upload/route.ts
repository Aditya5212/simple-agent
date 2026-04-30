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

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

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
  // Only enforce server-side size here. Content-type validation is done
  // by inspecting the file bytes (magic-bytes) below to avoid trusting
  // the client-provided `file.type` value.
  file: z
    .instanceof(Blob)
    .refine((file) => file.size <= MAX_FILE_SIZE_BYTES, {
      message: `File size should be less than or equal to ${
        MAX_FILE_SIZE_BYTES / (1024 * 1024)
      }MB`,
    }),
});

function isLikelyText(buffer: Buffer): boolean {
  const sample = buffer.slice(0, Math.min(buffer.length, 512));
  let nonPrintable = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte >= 0x20 && byte <= 0x7e) continue; // printable ASCII
    if (byte === 0x09 || byte === 0x0a || byte === 0x0d) continue; // tab/newline/return
    nonPrintable += 1;
  }

  return nonPrintable / sample.length < 0.3;
}

function detectMimeFromBuffer(buffer: Buffer, filename: string | null): string | null {
  if (buffer.length >= 4) {
    // JPEG
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }

    // PNG
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "image/png";
    }

    // GIF
    const gif = buffer.toString("ascii", 0, Math.min(6, buffer.length));
    if (gif === "GIF87a" || gif === "GIF89a") return "image/gif";

    // WEBP (RIFF....WEBP)
    if (buffer.length >= 12) {
      const riff = buffer.toString("ascii", 0, 4);
      const webp = buffer.toString("ascii", 8, 12);
      if (riff === "RIFF" && webp === "WEBP") return "image/webp";
    }

    // PDF
    if (buffer.toString("ascii", 0, 4) === "%PDF") return "application/pdf";

    // OLE compound file (older MS Office: .doc)
    if (
      buffer.length >= 8 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0
    ) {
      return "application/msword";
    }

    // ZIP-based (DOCX). Accept only when filename indicates docx.
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
      if (filename && filename.toLowerCase().endsWith(".docx")) {
        return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      }
      // otherwise return generic zip/unknown
      return null;
    }
  }

  // Heuristic for text / markdown
  if (isLikelyText(buffer)) {
    if (filename && filename.toLowerCase().endsWith(".md")) return "text/markdown";
    return "text/plain";
  }

  return null;
}

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
    const requestedSessionId = asOptionalNonEmptyString(formData.get("sessionId"));

    // If the client did not provide a sessionId, or provided one that does
    // not yet exist, create a new AI_AGENT session for this user. This
    // allows uploading directly from the main page where a session may not
    // have been created yet.
    let session = null;
    if (requestedSessionId) {
      const existing = await prisma.session.findUnique({ where: { id: requestedSessionId } });
      if (existing && existing.userId !== authSession.user.id) {
        return Response.json({ error: "forbidden_session", message: "Session not found or invalid for this user." }, { status: 403 });
      }

      if (existing) {
        if (existing.sessionType !== "AI_AGENT") {
          return Response.json({ error: "invalid_session_type", message: "Session exists but is not an AI session." }, { status: 400 });
        }
        session = existing;
      } else {
        // Claim the requested id for this user by creating the session.
        session = await prisma.session.create({
          data: {
            id: requestedSessionId,
            userId: authSession.user.id,
            sessionType: "AI_AGENT",
            title: filename.slice(0, 80),
            metadata: {
              createdVia: "api.files.upload",
            },
          },
        });
      }
    } else {
      // Create a fresh session for this upload when none was supplied.
      session = await prisma.session.create({
        data: {
          userId: authSession.user.id,
          sessionType: "AI_AGENT",
          title: filename.slice(0, 80),
          metadata: {
            createdVia: "api.files.upload",
          },
        },
      });
    }

    const sessionId = session.id;

    const arrayBuffer = await file.arrayBuffer();
    const fileBuffer = Buffer.from(arrayBuffer);
    const checksum = createHash("sha256").update(fileBuffer).digest("hex");

    // Content-based detection (magic-bytes) to avoid trusting client-provided MIME
    const detectedMime = detectMimeFromBuffer(fileBuffer, filename);
    if (!detectedMime || !ALLOWED_MIME_TYPES.has(detectedMime)) {
      return Response.json(
        { error: "unsupported_file_type", message: "Uploaded file content does not match allowed types." },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(filename);
    const objectFolder = getFolderFromMime(detectedMime);
    const key = `${objectFolder}/${authSession.user.id}/${Date.now()}-${randomUUID()}-${safeName}`;

    const upload = await putR2Object({
      key,
      Body: fileBuffer,
      ContentType: detectedMime,
      CacheControl: objectFolder === "images" ? "public, max-age=31536000, immutable" : "private, no-store",
      Metadata: {
        userId: authSession.user.id,
        originalName: filename,
      },
    });

    try {
      // Persist metadata in a transaction while enforcing per-session upload limits.
      // Rule: default max 10 files per session; if PDFs push projected PDF bytes
      // past threshold, reduce max to 8. This approximates "8-10 per session as per PDF size".
      const SESSION_MAX_DEFAULT = 10;
      const SESSION_MAX_SMALL_PDFS = 8;
      const PDF_SIZE_THRESHOLD_BYTES = 5 * 1024 * 1024; // 5MB

      let document;
      let ingestionJob;

      try {
        const result = await prisma.$transaction(async (tx) => {
          const existing = await tx.uploadedDocument.findMany({
            where: { sessionId, userId: authSession.user.id },
            select: { sizeBytes: true, mimeType: true },
          });

          const existingCount = existing.length;
          const existingPdfBytes = existing
            .filter((d) => d.mimeType === "application/pdf")
            .reduce((s, d) => s + (d.sizeBytes ?? 0), 0);

          const projectedPdfBytes =
            existingPdfBytes + (detectedMime === "application/pdf" ? file.size : 0);

          const sessionMax = projectedPdfBytes > PDF_SIZE_THRESHOLD_BYTES ? SESSION_MAX_SMALL_PDFS : SESSION_MAX_DEFAULT;

          if (existingCount >= sessionMax) {
            const err: any = new Error("session_upload_limit_exceeded");
            err.code = "SESSION_LIMIT";
            throw err;
          }

          const createdDoc = await tx.uploadedDocument.create({
            data: {
              userId: authSession.user.id,
              sessionId,
              filename,
              mimeType: detectedMime,
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

          const createdJob = await tx.ingestionJob.create({
            data: {
              documentId: createdDoc.id,
              userId: authSession.user.id,
              status: "queued",
              phase: "upload",
              metadata: {
                source: "api.files.upload",
              },
            },
          });

          return { createdDoc, createdJob, sessionMax, existingCount };
        });

        document = result.createdDoc;
        ingestionJob = result.createdJob;
      } catch (txError: any) {
        // If we hit the session limit, clean up uploaded R2 object and return an error.
        if (txError?.message === "session_upload_limit_exceeded" || txError?.code === "SESSION_LIMIT") {
          try {
            await deleteR2Object(key);
          } catch (_cleanupError) {
            // ignore
          }

          return Response.json(
            {
              error: "session_upload_limit_exceeded",
              message:
                "Upload limit reached for this session. Reduce uploads or remove existing files before uploading more.",
            },
            { status: 400 }
          );
        }

        // For other transaction errors, attempt to cleanup and return a generic DB error.
        try {
          await deleteR2Object(key);
        } catch (_cleanupError) {
          // ignore
        }

        return Response.json({ error: "upload_metadata_persist_failed" }, { status: 500 });
      }

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
        contentType: detectedMime,
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
