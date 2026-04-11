import { mastra } from "@/mastra";
import type { AgentExecutionOptions } from "@mastra/core/agent";
import type { MemoryConfigInternal } from "@mastra/core/memory";

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

type AgentRequest = {
  message?: string;
  threadId?: string;
  resourceId?: string;
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

function toStringArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
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

  const agent = mastra.getAgentById("simple-agent");
  const result = await agent.generate(message, {
    maxSteps: body?.config?.maxSteps ?? 5,
    modelSettings,
    providerOptions: body?.config?.providerOptions,
    instructions: body?.config?.instructions,
    system: systemMessages.length ? systemMessages : undefined,
    memory: {
      thread: threadId,
      resource: resourceId,
      options: memoryOptions,
    },
  });

  const response: Record<string, unknown> = {
    text: result.text,
    threadId,
    resourceId,
  };

  if (include.response) {
    response.response = result.response;
  }
  if (include.usage) {
    response.usage = result.usage;
  }
  if (include.messages) {
    response.messages = result.messages;
  }

  return Response.json(response);
}
