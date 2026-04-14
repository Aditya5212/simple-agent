import {
  DEFAULT_CHAT_MODEL,
  GEMINI_FLASH_MODEL,
  GEMINI_LITE_MODEL,
  GEMINI_PRO_MODEL,
} from "@/lib/ai/models";
import { ChatbotError } from "@/lib/errors";
import { POST as agentChatPost } from "@/app/api/agent/chat/route";
import { DELETE as deleteSession } from "@/app/api/agent/sessions/[sessionId]/route";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const maxDuration = 60;

type MessageLike = {
  parts?: Array<Record<string, unknown>>;
};

const AGENT_TYPE_BY_MODEL_ID = new Map([
  [DEFAULT_CHAT_MODEL, "simple-agent"],
  [GEMINI_FLASH_MODEL, "simple-agent-gemini-flash"],
  [GEMINI_PRO_MODEL, "simple-agent-gemini-pro"],
  [GEMINI_LITE_MODEL, "simple-agent-gemini-lite"],
]);

const VISION_MODEL_IDS = new Set([
  GEMINI_FLASH_MODEL,
  GEMINI_PRO_MODEL,
  GEMINI_LITE_MODEL,
]);

function isImageFilePart(part: Record<string, unknown>): boolean {
  if (part.type !== "file") return false;
  const mediaType = typeof part.mediaType === "string" ? part.mediaType : "";
  return mediaType.startsWith("image/");
}

function filterMessageParts<T extends MessageLike>(
  message: T,
  allowImages: boolean
): T {
  if (!Array.isArray(message.parts)) {
    return message;
  }

  const filteredParts = message.parts.filter(
    (part) => part.type !== "file" || (allowImages && isImageFilePart(part))
  );

  return {
    ...message,
    parts: filteredParts,
  } as T;
}

function normalizeMessages(requestBody: PostRequestBody) {
  if (requestBody.messages && requestBody.messages.length > 0) {
    return requestBody.messages;
  }

  if (requestBody.message) {
    return [requestBody.message];
  }

  return [];
}

export async function POST(request: Request) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_error) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const normalizedMessages = normalizeMessages(requestBody);

  if (normalizedMessages.length === 0) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  const selectedModelId = AGENT_TYPE_BY_MODEL_ID.has(requestBody.selectedChatModel)
    ? requestBody.selectedChatModel
    : DEFAULT_CHAT_MODEL;
  const allowImages = VISION_MODEL_IDS.has(selectedModelId);
  const agentType = AGENT_TYPE_BY_MODEL_ID.get(selectedModelId) ?? "simple-agent";

  const filteredMessages = normalizedMessages.map((message) =>
    filterMessageParts(message, allowImages)
  );

  const agentRequestBody = {
    sessionId: requestBody.id,
    agentType,
    messages: filteredMessages,
  };

  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers: new Headers(request.headers),
    body: JSON.stringify(agentRequestBody),
  });

  return agentChatPost(forwardedRequest);
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatbotError("bad_request:api").toResponse();
  }

  return deleteSession(request, { params: Promise.resolve({ sessionId: id }) });
}
