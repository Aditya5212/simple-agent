import { Queue } from "bullmq";
import { redisConnection } from "./redis";

export type IngestionQueuePayload = {
  ingestionJobId?: string;
  documentId: string;
  userId: string;
  trigger?: "upload-auto" | "testing-route" | "manual";
};

export type IngestionQueueResult = {
  success: boolean;
  documentId: string;
  ingestionJobId?: string;
  parseJobId?: string;
  chunkCount?: number;
  vectorIndex?: string;
  reason?: string;
};

export const ingestionQueue = new Queue<IngestionQueuePayload, IngestionQueueResult>(
  "document-ingestion",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  }
);
