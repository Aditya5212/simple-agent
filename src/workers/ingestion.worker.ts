import { Job, Worker } from "bullmq";
import {
  type IngestionQueuePayload,
  type IngestionQueueResult,
} from "@/lib/queues/ingestion.queue";
import { redisConnection } from "@/lib/queues/redis";
import { runDocumentIngestionPipeline } from "@/lib/ingestion/document-pipeline";

let workerSingleton: Worker<IngestionQueuePayload, IngestionQueueResult> | null = null;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function createIngestionWorker() {
  if (workerSingleton) {
    return workerSingleton;
  }

  const concurrency = parsePositiveInt(process.env.INGESTION_WORKER_CONCURRENCY, 3);
  const limiterMax = parsePositiveInt(process.env.INGESTION_WORKER_RATE_LIMIT_MAX, 10);
  const limiterDuration = parsePositiveInt(
    process.env.INGESTION_WORKER_RATE_LIMIT_DURATION,
    60000
  );

  const worker = new Worker<IngestionQueuePayload, IngestionQueueResult>(
    "document-ingestion",
    async (job: Job<IngestionQueuePayload, IngestionQueueResult>) => {
      const result = await runDocumentIngestionPipeline({
        documentId: job.data.documentId,
        userId: job.data.userId,
        ingestionJobId: job.data.ingestionJobId,
        trigger: job.data.trigger ?? "upload-auto",
        onPhaseChange: async (phase, pct) => {
          await job.updateProgress({ phase, pct });
        },
      });

      if (!result.success) {
        throw new Error(result.reason ?? "document_pipeline_failed");
      }

      return result;
    },
    {
      connection: redisConnection,
      concurrency,
      limiter: {
        max: limiterMax,
        duration: limiterDuration,
      },
    }
  );

  worker.on("active", (job) => {
    console.info("[ingestion-worker] active", {
      jobId: job?.id,
      ingestionJobId: job?.data.ingestionJobId,
      documentId: job?.data.documentId,
    });
  });

  worker.on("progress", (job, progress) => {
    console.info("[ingestion-worker] progress", {
      jobId: job?.id,
      ingestionJobId: job?.data.ingestionJobId,
      progress,
    });
  });

  worker.on("completed", (job, result) => {
    console.info("[ingestion-worker] completed", {
      jobId: job?.id,
      ingestionJobId: job?.data.ingestionJobId,
      documentId: job?.data.documentId,
      result,
    });
  });

  worker.on("failed", (job, error) => {
    console.error("[ingestion-worker] failed", {
      jobId: job?.id,
      ingestionJobId: job?.data.ingestionJobId,
      documentId: job?.data.documentId,
      reason: error.message,
    });
  });

  worker.on("stalled", (jobId) => {
    console.warn(`[ingestion-worker] stalled: ${jobId}`);
  });

  const shutdown = async () => {
    await worker.close();
    workerSingleton = null;
  };

  process.once("SIGTERM", () => {
    void shutdown();
  });

  process.once("SIGINT", () => {
    void shutdown();
  });

  workerSingleton = worker;
  return worker;
}

createIngestionWorker();
