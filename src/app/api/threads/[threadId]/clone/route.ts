import { companionMemory } from "@/mastra/storage";

function parseDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

type CloneThreadRequest = {
  newThreadId?: string;
  resourceId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  options?: {
    messageLimit?: number;
    messageFilter?: {
      startDate?: string;
      endDate?: string;
      messageIds?: string[];
    };
  };
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as CloneThreadRequest | null;
  const messageFilter = body?.options?.messageFilter;

  const result = await companionMemory.cloneThread({
    sourceThreadId: threadId,
    newThreadId:
      typeof body?.newThreadId === "string" ? body.newThreadId : undefined,
    resourceId:
      typeof body?.resourceId === "string" ? body.resourceId : undefined,
    title: typeof body?.title === "string" ? body.title : undefined,
    metadata:
      body?.metadata && typeof body.metadata === "object" ? body.metadata : undefined,
    options: body?.options
      ? {
          messageLimit: body.options.messageLimit,
          messageFilter: messageFilter
            ? {
                startDate: parseDate(messageFilter.startDate),
                endDate: parseDate(messageFilter.endDate),
                messageIds: Array.isArray(messageFilter.messageIds)
                  ? messageFilter.messageIds
                  : undefined,
              }
            : undefined,
        }
      : undefined,
  });

  return Response.json(result, { status: 201 });
}
