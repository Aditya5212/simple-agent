import { redisConnection } from "@/lib/queues/redis";
import { ChatbotError } from "@/lib/errors";
import { createHash } from "node:crypto";

function getIpFromRequest(req?: Request | null): string | null {
  if (!req) return null;

  // Standard proxies set x-forwarded-for (may contain a comma list)
  const xff = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip");
  if (xff) return xff.split(",")[0].trim();

  const vercel = req.headers.get("x-vercel-forwarded-for") || req.headers.get("x-forwarded-for-ip");
  if (vercel) return vercel.split(",")[0].trim();

  return null;
}

async function incrWithExpiry(key: string, windowSeconds: number) {
  const raw = await redisConnection.incr(key);
  const count = Number(raw);
  if (count === 1) {
    try {
      await redisConnection.expire(key, windowSeconds);
    } catch {
      // best-effort
    }
  }
  return count;
}

export async function checkIpRateLimit(req?: Request | null) {
  const max = Number.parseInt(process.env.IP_RATE_LIMIT_MAX ?? "600", 10);
  const windowSec = Number.parseInt(process.env.IP_RATE_LIMIT_WINDOW_SECONDS ?? "3600", 10);

  try {
    const ip = getIpFromRequest(req);

    // If we can't determine an IP, skip IP-based limiting to avoid
    // globally throttling traffic behind malformed requests or exotic runtimes.
    if (!ip) return;

    // Hash the IP for key hygiene (avoid long keys / special chars).
    const normalized = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    const key = `rl:ip:${normalized}`;
    const count = await incrWithExpiry(key, windowSec);

    if (count > max) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (err) {
    // If Redis is unavailable, fail-open to avoid blocking valid requests.
    // Log the error for ops to investigate.
    if (err instanceof ChatbotError) throw err;
    // eslint-disable-next-line no-console
    console.warn("[ratelimit] redis check failed, allowing request", err);
  }
}

export async function checkUserRateLimit(userId: string) {
  if (!userId) return;

  const max = Number.parseInt(process.env.USER_RATE_LIMIT_MAX ?? "30", 10);
  const windowSec = Number.parseInt(process.env.USER_RATE_LIMIT_WINDOW_SECONDS ?? "60", 10);

  try {
    const key = `rl:user:${userId}`;
    const count = await incrWithExpiry(key, windowSec);
    if (count > max) {
      throw new ChatbotError("rate_limit:chat");
    }
  } catch (err) {
    if (err instanceof ChatbotError) throw err;
    // eslint-disable-next-line no-console
    console.warn("[ratelimit] redis check failed (user), allowing request", err);
  }
}
