/**
 * API Docs
 *
 * Route: GET /api/ingestion/jobs/{jobId}/parse-result
 * Purpose: Testing-only debug endpoint to inspect Llama Parse raw job output.
 *
 * Auth:
 * - Requires logged-in user session.
 * - Ingestion job must belong to the authenticated user.
 *
 * Query params:
 * - expand (optional): comma-separated expand fields, e.g. markdown,text,metadata.
 */

import { auth } from "@/app/(auth)/auth";
import {
  getLlamaParseJob,
  LlamaParseHttpError,
  parseLlamaParseExpandQuery,
} from "@/lib/llama-parse";
import { prisma } from "@/lib/prisma";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return {};
}

function getNestedString(value: unknown, keys: string[]): string | null {
  let current: unknown = value;

  for (const key of keys) {
    const objectValue = asObject(current);
    current = objectValue[key];
  }

  if (typeof current !== "string") return null;
  const trimmed = current.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readParseJobId(metadata: unknown): string | null {
  const direct = getNestedString(metadata, ["parseJobId"]);
  if (direct) return direct;

  const inParser = getNestedString(metadata, ["parser", "parseJobId"]);
  if (inParser) return inParser;

  return null;
}

function inferTerminalStatus(payload: unknown): "success" | "failed" | null {
  const status =
    getNestedString(payload, ["status"]) ??
    getNestedString(payload, ["job", "status"]) ??
    getNestedString(payload, ["data", "status"]);

  if (!status) return null;

  const normalized = status.toLowerCase();

  if (
    normalized === "success" ||
    normalized === "completed" ||
    normalized === "done"
  ) {
    return "success";
  }

  if (normalized === "failed" || normalized === "error" || normalized === "cancelled") {
    return "failed";
  }

  return null;
}

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const authSession = await auth();

  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { jobId } = await context.params;

  const job = await prisma.ingestionJob.findFirst({
    where: {
      id: jobId,
      userId: authSession.user.id,
    },
    select: {
      id: true,
      documentId: true,
      status: true,
      phase: true,
      metadata: true,
    },
  });

  if (!job) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const parseJobId = readParseJobId(job.metadata);
  if (!parseJobId) {
    return Response.json({ error: "parse_job_not_found" }, { status: 400 });
  }

  const url = new URL(request.url);
  const expand = parseLlamaParseExpandQuery(url.searchParams.get("expand"));

  try {
    const result = await getLlamaParseJob({
      jobId: parseJobId,
      expand,
    });

    const terminalStatus = inferTerminalStatus(result);

    return Response.json({
      testingOnly: true,
      ingestionJobId: job.id,
      parseJobId,
      terminalStatus,
      ingestionStatus: {
        status: job.status,
        phase: job.phase,
      },
      result,
    });
  } catch (error) {
    if (error instanceof LlamaParseHttpError) {
      return Response.json(
        {
          error: "llama_parse_request_failed",
          status: error.status,
          details: error.details,
        },
        { status: 502 }
      );
    }

    return Response.json({ error: "llama_parse_fetch_failed" }, { status: 500 });
  }
}
