import { mastra } from "@/mastra";

type AgentRequest = {
  message?: string;
  threadId?: string;
  resourceId?: string;
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as AgentRequest | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 });
  }

  const threadId =
    typeof body?.threadId === "string" && body.threadId
      ? body.threadId
      : "local-thread";
  const resourceId =
    typeof body?.resourceId === "string" && body.resourceId
      ? body.resourceId
      : "local-resource";

  const agent = mastra.getAgentById("simple-agent");
  const result = await agent.generate(message, {
    memory: {
      thread: threadId,
      resource: resourceId,
    },
  });

  return Response.json({ text: result.text });
}
