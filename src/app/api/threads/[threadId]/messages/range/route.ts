import { companionMemory } from "@/mastra/storage";

function parseNumber(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const resourceId = searchParams.get("resourceId") ?? undefined;
  const page = parseNumber(searchParams.get("page"), 0);
  const perPage = parseNumber(searchParams.get("perPage"), 40);
  const start = searchParams.get("startDate");
  const end = searchParams.get("endDate");

  const startDate = start ? new Date(start) : undefined;
  const endDate = end ? new Date(end) : undefined;

  const result = await companionMemory.recall({
    threadId,
    resourceId,
    page,
    perPage,
    filter: {
      dateRange: {
        start: startDate,
        end: endDate,
      },
    },
  });

  return Response.json(result);
}
