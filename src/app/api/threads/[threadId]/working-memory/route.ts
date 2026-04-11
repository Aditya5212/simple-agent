import { companionMemory } from "@/mastra/storage";

type WorkingMemoryRequest = {
  resourceId?: string;
  workingMemory?: string;
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { searchParams } = new URL(req.url);
  const resourceId = searchParams.get("resourceId") ?? undefined;

  const workingMemory = await companionMemory.getWorkingMemory({
    threadId,
    resourceId,
  });

  return Response.json({
    threadId,
    resourceId,
    workingMemory,
  });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as WorkingMemoryRequest | null;
  const resourceId = typeof body?.resourceId === "string" ? body.resourceId : undefined;
  const workingMemory =
    typeof body?.workingMemory === "string" ? body.workingMemory : "";

  if (!workingMemory) {
    return Response.json({ error: "workingMemory is required" }, { status: 400 });
  }

  await companionMemory.updateWorkingMemory({
    threadId,
    resourceId,
    workingMemory,
  });

  return Response.json({
    updated: true,
    threadId,
    resourceId,
  });
}
