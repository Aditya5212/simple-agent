/**
 * API Docs
 *
 * Route: POST /api/agent/chat
 * Purpose: Session-aware, authenticated agent chat endpoint using Mastra's
 * standard AI SDK UI streaming format.
 *
 * Auth:
 * - Requires logged-in user session.
 * - Uses authenticated user id as the memory resource id.
 *
 * Request body (example):
 * {
 *   "agentType": "simple-agent",
 *   "sessionId": "session12345",
 *   "message": "Plan my week",
 *   "messages": [
 *     {
 *       "id": "msg-1",
 *       "role": "user",
 *       "parts": [{ "type": "text", "text": "Plan my week" }]
 *     }
 *   ],
 *   "trigger": "submit-message",
 *   "resumeData": {},
 *   "config": {
 *     "maxSteps": 5,
 *     "modelSettings": { "temperature": 0.2 },
 *     "instructions": "Keep it short",
 *     "system": "Be practical",
 *     "formatting": { "responseFormat": "markdown" },
 *     "memoryOptions": { "workingMemory": { "enabled": true } },
 *     "include": { "response": false, "usage": false, "messages": false }
 *   }
 * }
 *
 * Response:
 * - Content-Type: text/event-stream
 * - Body: AI SDK UI stream chunks consumable by useChat/DefaultChatTransport.
 *
 * Error responses (JSON):
 * - 401: { "error": "unauthorized" }
 * - 400: { "error": "Either message or messages is required" }
 * - 400: { "error": "unsupported agentType", "supportedAgentTypes": ["simple-agent"] }
 * - 403: { "error": "forbidden:session" }
 *
 * Session <-> Mastra thread mapping:
 * - sessionId is the app conversation key persisted in DB.
 * - threadId is derived at runtime as `${userId}-${sessionId}`.
 * - resourceId is derived at runtime as `${sessionId}-${userId}`.
 */

import { createUIMessageStream, createUIMessageStreamResponse, type UIMessage } from "ai";
import { handleChatStream } from "@mastra/ai-sdk";
import { auth } from "@/app/(auth)/auth";
import { prisma } from "@/lib/prisma";
import { mastra } from "@/mastra";
import type { Prisma } from "@prisma/client";
import type { AgentExecutionOptions } from "@mastra/core/agent";
import type { MemoryConfigInternal } from "@mastra/core/memory";

export const maxDuration = 60;

type ProviderOptions = NonNullable<AgentExecutionOptions["providerOptions"]>;

type FormattingConfig = {
  responseFormat?: "markdown" | "text" | "json";
  tone?: "concise" | "detailed" | "friendly" | "formal";
  bulletStyle?: "dash" | "numbered";
  includeHeadings?: boolean;
  includeSteps?: boolean;
  includeCodeBlocks?: boolean;
  codeLanguage?: string;
};

type ModelSettings = {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  stop?: string | string[];
};

type MemoryOptionsInput = Partial<MemoryConfigInternal> & {
  workingMemory?: {
    enabled?: boolean;
    scope?: "thread" | "resource";
    template?: string;
    schema?: unknown;
    version?: "stable" | "vnext";
  };
};

type ChatConfig = {
  maxSteps?: number;
  modelSettings?: ModelSettings;
  providerOptions?: ProviderOptions;
  instructions?: string | string[];
  system?: string | string[];
  formatting?: FormattingConfig;
  memoryOptions?: MemoryOptionsInput;
  include?: {
    response?: boolean;
    usage?: boolean;
    messages?: boolean;
  };
};

type AgentChatRequest = {
  messages?: UIMessage[];
  trigger?: "submit-message" | "regenerate-message";
  resumeData?: Record<string, unknown>;
  message?: string;
  agentType?: string;
  sessionId?: string;
  config?: ChatConfig;
};

const defaultFormatting: Required<FormattingConfig> = {
  responseFormat: "markdown",
  tone: "concise",
  bulletStyle: "dash",
  includeHeadings: true,
  includeSteps: false,
  includeCodeBlocks: true,
  codeLanguage: "typescript",
};

const defaultModelSettings: Required<ModelSettings> = {
  temperature: 0.2,
  maxOutputTokens: 1024,
  topP: 1,
  presencePenalty: 0,
  frequencyPenalty: 0,
  stop: [],
};

const allowedAgentTypes = new Set(["simple-agent"]);

function toStringArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function toPrismaJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function isUIMessageArray(value: unknown): value is UIMessage[] {
  return Array.isArray(value);
}

function buildFormattingInstruction(formatting: Required<FormattingConfig>) {
  const parts = [
    formatting.responseFormat === "json"
      ? "Return valid JSON only, with no extra text."
      : `Respond in ${formatting.responseFormat}.`,
    `Tone: ${formatting.tone}.`,
    formatting.includeHeadings
      ? "Use short headings when helpful."
      : "Avoid headings.",
    formatting.bulletStyle === "numbered"
      ? "Use numbered lists for enumerations."
      : "Use '-' for bullet lists.",
    formatting.includeSteps ? "Use step-by-step format for procedures." : "",
    formatting.includeCodeBlocks
      ? `Use fenced code blocks with language '${formatting.codeLanguage}'.`
      : "Avoid code blocks.",
  ];

  return parts.filter(Boolean).join(" ");
}

function getTextFromParts(parts: UIMessage["parts"]): string {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

function getLatestUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user") {
      const text = getTextFromParts(message.parts).trim();
      if (text.length > 0) return text;
    }
  }
  return "";
}

function getAssistantResponseText(messages: UIMessage[]): string {
  return messages
    .filter((message) => message.role === "assistant")
    .map((message) => getTextFromParts(message.parts).trim())
    .filter((text) => text.length > 0)
    .join("\n\n");
}

type UsageSnapshot = {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
};

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return value;
}

function parseUsageSnapshot(value: unknown): UsageSnapshot | undefined {
  const usageObj = asObject(value);
  const inputTokens = asFiniteNumber(usageObj.inputTokens);
  const outputTokens = asFiniteNumber(usageObj.outputTokens);
  const totalTokens = asFiniteNumber(usageObj.totalTokens);

  if (
    inputTokens === undefined &&
    outputTokens === undefined &&
    totalTokens === undefined
  ) {
    return undefined;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
  };
}

function getUsageFromResponseMessage(message: UIMessage | undefined): UsageSnapshot | undefined {
  const messageObj = asObject(message);
  const metadata = asObject(messageObj.metadata);
  return parseUsageSnapshot(metadata.totalUsage ?? metadata.usage);
}

export async function POST(req: Request) {
  const authSession = await auth();
  if (!authSession?.user?.id) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as AgentChatRequest | null;
  const directMessage = typeof body?.message === "string" ? body.message.trim() : "";
  const incomingMessages = isUIMessageArray(body?.messages) ? body.messages : [];

  if (directMessage.length === 0 && incomingMessages.length === 0) {
    return Response.json(
      { error: "Either message or messages is required" },
      { status: 400 }
    );
  }

  const requestedAgentType =
    typeof body?.agentType === "string" && body.agentType.trim().length > 0
      ? body.agentType.trim()
      : "simple-agent";

  if (!allowedAgentTypes.has(requestedAgentType)) {
    return Response.json(
      { error: "unsupported agentType", supportedAgentTypes: [...allowedAgentTypes] },
      { status: 400 }
    );
  }

  const normalizedMessages: UIMessage[] =
    incomingMessages.length > 0
      ? incomingMessages
      : [
          {
            id: crypto.randomUUID(),
            role: "user",
            parts: [{ type: "text", text: directMessage }],
          } satisfies UIMessage,
        ];

  const formatting = {
    ...defaultFormatting,
    ...(body?.config?.formatting ?? {}),
  };
  const modelSettings = {
    ...defaultModelSettings,
    ...(body?.config?.modelSettings ?? {}),
  };
  const include = {
    response: false,
    usage: false,
    messages: false,
    ...(body?.config?.include ?? {}),
  };
  const systemMessages = [
    ...toStringArray(body?.config?.system),
    buildFormattingInstruction(formatting),
  ];

  const rawMemoryOptions = body?.config?.memoryOptions;
  const memoryOptions = rawMemoryOptions
    ? ({
        ...rawMemoryOptions,
        workingMemory: rawMemoryOptions.workingMemory
          ? {
              enabled: rawMemoryOptions.workingMemory.enabled ?? true,
              scope: rawMemoryOptions.workingMemory.scope,
              template: rawMemoryOptions.workingMemory.template,
              schema: rawMemoryOptions.workingMemory.schema,
              version: rawMemoryOptions.workingMemory.version,
            }
          : undefined,
      } as MemoryConfigInternal)
    : undefined;

  const userId = authSession.user.id;
  const latestUserText = getLatestUserText(normalizedMessages) || directMessage;
  const requestedSessionId =
    typeof body?.sessionId === "string" && body.sessionId.trim().length > 0
      ? body.sessionId.trim()
      : undefined;

  let sessionRecord;
  if (requestedSessionId) {
    const existingSession = await prisma.session.findUnique({
      where: { id: requestedSessionId },
    });

    if (existingSession && existingSession.userId !== userId) {
      return Response.json({ error: "forbidden:session" }, { status: 403 });
    }

    sessionRecord =
      existingSession ??
      (await prisma.session.create({
        data: {
          id: requestedSessionId,
          userId,
          sessionType: "AI_AGENT",
          title: latestUserText.slice(0, 80),
          metadata: {
            agentType: requestedAgentType,
          },
        },
      }));
  } else {
    sessionRecord = await prisma.session.create({
      data: {
        userId,
        sessionType: "AI_AGENT",
        title: latestUserText.slice(0, 80),
        metadata: {
          agentType: requestedAgentType,
        },
      },
    });
  }

  const existingSessionMetadata = asObject(sessionRecord.metadata);
  const runtimeSessionKey = sessionRecord.id;
  const threadId = `${userId}-${runtimeSessionKey}`;
  const mastraResourceId = `${runtimeSessionKey}-${userId}`;

  const updatedSessionMetadata: Record<string, unknown> = {
    ...existingSessionMetadata,
    sessionId: runtimeSessionKey,
    threadId,
    resourceId: mastraResourceId,
    agentType: requestedAgentType,
  };

  const requestId = crypto.randomUUID();

  sessionRecord = await prisma.session.update({
    where: { id: sessionRecord.id },
    data: { metadata: toPrismaJson(updatedSessionMetadata) },
  });

  const conversation = await prisma.aIAgentConversation.create({
    data: {
      userId,
      sessionId: sessionRecord.id,
      agentType: requestedAgentType,
      userMessage: latestUserText,
      aiResponse: "",
      inputTokens: 0,
      outputTokens: 0,
      totalCost: 0,
      requestId,
      status: "active",
      metadata: {
        threadId,
        resourceId: mastraResourceId,
        trigger: body?.trigger,
        include,
      },
    },
  });

  let streamErrorMessage: string | null = null;
  let lastProviderMetadata: unknown;
  let lastStepUsage: unknown;
  let lastRawFinishReason: unknown;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const mastraStream = await handleChatStream({
        version: "v6",
        mastra,
        agentId: requestedAgentType,
        params: {
          messages: normalizedMessages,
          trigger: body?.trigger,
          resumeData: body?.resumeData,
          maxSteps: body?.config?.maxSteps ?? 5,
          modelSettings,
          providerOptions: body?.config?.providerOptions,
          instructions: body?.config?.instructions,
          system: systemMessages.length > 0 ? systemMessages : undefined,
          memory: {
            thread: threadId,
            resource: mastraResourceId,
            options: memoryOptions,
          },
        },
        messageMetadata: ({ part }) => {
          if (part.type === "finish-step") {
            lastProviderMetadata = part.providerMetadata;
            lastStepUsage = part.usage;
            lastRawFinishReason = part.rawFinishReason;

            // Only emit a single metadata event on final finish.
            return undefined;
          }

          if (part.type === "finish") {
            return {
              metadataType: "provider-finish",
              providerMetadata: lastProviderMetadata,
              usage: lastStepUsage,
              totalUsage: part.totalUsage,
              finishReason: part.finishReason,
              rawFinishReason: part.rawFinishReason ?? lastRawFinishReason,
            };
          }

          return undefined;
        },
        onError: () => "Oops, an error occurred!",
      });

      writer.merge(mastraStream);
    },
    onFinish: async ({
      messages: finishedMessages,
      responseMessage,
      finishReason,
      isAborted,
    }) => {
      const assistantText = getAssistantResponseText(finishedMessages as UIMessage[]);
      const usage = getUsageFromResponseMessage(responseMessage as UIMessage | undefined);
      const finalStatus =
        streamErrorMessage || isAborted || finishReason === "error"
          ? "failed"
          : "completed";

      await prisma.aIAgentConversation.update({
        where: { id: conversation.id },
        data: {
          aiResponse: assistantText,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          status: finalStatus,
          metadata: {
            ...(asObject(conversation.metadata) ?? {}),
            finishedAt: new Date().toISOString(),
            finishReason,
            usage,
            usageSource: usage ? "provider" : "unavailable",
            error: streamErrorMessage,
          },
        },
      });

      await prisma.session.update({
        where: { id: sessionRecord.id },
        data: {
          metadata: toPrismaJson({
            ...updatedSessionMetadata,
            lastRequestId: requestId,
            lastConversationId: conversation.id,
            lastStatus: finalStatus,
          }),
        },
      });
    },
    onError: (error) => {
      streamErrorMessage = error instanceof Error ? error.message : "stream_failed";

      void prisma.aIAgentConversation.update({
        where: { id: conversation.id },
        data: {
          status: "failed",
          metadata: {
            ...(asObject(conversation.metadata) ?? {}),
            error: streamErrorMessage,
          },
        },
      });

      void prisma.session.update({
        where: { id: sessionRecord.id },
        data: {
          metadata: toPrismaJson({
            ...updatedSessionMetadata,
            lastRequestId: requestId,
            lastConversationId: conversation.id,
            lastStatus: "failed",
          }),
        },
      });

      return "Oops, an error occurred!";
    },
  });

  return createUIMessageStreamResponse({ stream });
}
