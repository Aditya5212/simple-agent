import { companionMemory } from "@/mastra/storage";

function parseNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePerPage(value: string | null, fallback: number) {
  if (!value) return fallback;
  if (value === "false") return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseMetadata(value: string | null) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

type CreateThreadRequest = {
  resourceId?: string;
  threadId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const resourceId = searchParams.get("resourceId");

  if (!resourceId) {
    return Response.json({ error: "resourceId is required" }, { status: 400 });
  }

  const page = parseNumber(searchParams.get("page"), 0);
  const perPage = parsePerPage(searchParams.get("perPage"), 100);
  const orderByField = searchParams.get("orderBy") as "createdAt" | "updatedAt" | null;
  const direction = searchParams.get("direction")?.toUpperCase() as "ASC" | "DESC" | undefined;
  const metadata = parseMetadata(searchParams.get("metadata"));

  const result = await companionMemory.listThreads({
    filter: {
      resourceId,
      ...(metadata ? { metadata } : {}),
    },
    page,
    perPage,
    orderBy: {
      field: orderByField ?? "updatedAt",
      direction: direction ?? "DESC",
    },
  });

  return Response.json(result);
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as CreateThreadRequest | null;
  const resourceId = typeof body?.resourceId === "string" ? body.resourceId.trim() : "";

  if (!resourceId) {
    return Response.json({ error: "resourceId is required" }, { status: 400 });
  }

  const thread = await companionMemory.createThread({
    resourceId,
    threadId: typeof body?.threadId === "string" ? body.threadId : undefined,
    title: typeof body?.title === "string" ? body.title : undefined,
    metadata:
      body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    saveThread: true,
  });

  return Response.json(thread, { status: 201 });
}
