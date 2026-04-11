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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const resourceId = searchParams.get("resourceId");

  if (!resourceId) {
    return Response.json({ error: "resourceId is required" }, { status: 400 });
  }

  const page = parseNumber(searchParams.get("page"), 0);
  const perPage = parsePerPage(searchParams.get("perPage"), 40);

  const result = await companionMemory.listMessagesByResourceId({
    resourceId,
    page,
    perPage,
  });

  return Response.json({
    threadId,
    ...result,
  });
}
