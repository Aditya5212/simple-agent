import { companionMemory } from "@/mastra/storage";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  await companionMemory.deleteThread(threadId);
  return Response.json({ deleted: true, threadId });
}
