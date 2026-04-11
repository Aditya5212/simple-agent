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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const resourceId = searchParams.get("resourceId") ?? undefined;
  const page = parseNumber(searchParams.get("page"), 0);
  const perPage = parsePerPage(searchParams.get("perPage"), 40);
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
    vectorSearchString,
    includeSystemReminders,
  });

  return Response.json(result);
}
