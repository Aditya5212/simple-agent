import { mastra } from "@/mastra";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as {
    resourceId?: string;
    lastMessages?: number;
  } | null;
  const resourceId =
    typeof body?.resourceId === "string" ? body.resourceId.trim() : "";
  const lastMessages =
    typeof body?.lastMessages === "number" && body.lastMessages > 0
      ? Math.floor(body.lastMessages)
      : 40;

  if (!resourceId) {
    return Response.json({ error: "resourceId is required" }, { status: 400 });
  }

  const agent = mastra.getAgentById("simple-agent");
  const result = await agent.generate(
    "Summarize the conversation thread briefly.",
    {
      memory: {
        thread: threadId,
        resource: resourceId,
        options: {
          lastMessages,
        },
      },
    }
  );

  return Response.json({
    threadId,
    summary: result.text,
  });
}
