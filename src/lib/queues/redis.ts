import IORedis from "ioredis";

const redisUrl = process.env.REDIS_URL;

if (!redisUrl) {
  throw new Error("REDIS_URL is required for BullMQ ingestion queue");
}

export const redisConnection = new IORedis(redisUrl, {
  // BullMQ requires this for blocking commands.
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
