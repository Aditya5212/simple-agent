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

function parseBoolean(value: string | null, fallback: boolean) {
  if (!value) return fallback;
  return value === "true" || value === "1";
}

type DeleteMessagesRequest = {
  messageIds?: string[];
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const resourceId = searchParams.get("resourceId") ?? undefined;
  const page = parseNumber(searchParams.get("page"), 0);
  const perPage = parsePerPage(searchParams.get("perPage"), 40);
  const direction = searchParams.get("direction")?.toUpperCase() as
    | "ASC"
    | "DESC"
    | undefined;
  const includeSystemReminders = parseBoolean(
    searchParams.get("includeSystemReminders"),
    false
  );
  const vectorSearchString = searchParams.get("search") ?? undefined;

  const result = await companionMemory.recall({
    threadId,
    resourceId,
    page,
    perPage,
    orderBy: {
      field: "createdAt",
      direction: direction ?? "ASC",
    },
    vectorSearchString,
    includeSystemReminders,
  });

  return Response.json(result);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as DeleteMessagesRequest | null;
  const messageIds = Array.isArray(body?.messageIds)
    ? body?.messageIds.filter(id => typeof id === "string" && id.length > 0)
    : [];

  if (messageIds.length === 0) {
    return Response.json({ error: "messageIds is required" }, { status: 400 });
  }

  await companionMemory.deleteMessages(messageIds);

  return Response.json({
    deleted: messageIds.length,
    threadId,
  });
}
