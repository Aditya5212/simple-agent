export type ModelCapabilities = {
  tools: boolean;
  vision: boolean;
  reasoning: boolean;
};

export type ChatModel = {
  id: string;
  name: string;
  provider: string;
  description: string;
  gatewayOrder?: string[];
  reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high";
};

export const DEFAULT_CHAT_MODEL = "nvidia/moonshotai/kimi-k2-instruct";
export const GEMINI_FLASH_MODEL = "google/gemini-3-flash-preview";
export const GEMINI_PRO_MODEL = "google/gemini-3.1-pro-preview";
export const GEMINI_LITE_MODEL = "google/gemini-3.1-flash-lite-preview";

export const chatModels: ChatModel[] = [
  {
    id: DEFAULT_CHAT_MODEL,
    name: "Kimi K2 Instruct",
    provider: "nvidia",
    description: "Default chat model",
  },
  {
    id: GEMINI_FLASH_MODEL,
    name: "Gemini 3 Flash Preview",
    provider: "google",
    description: "Fast multimodal model",
  },
  {
    id: GEMINI_PRO_MODEL,
    name: "Gemini 3.1 Pro Preview",
    provider: "google",
    description: "High quality multimodal model",
  },
  {
    id: GEMINI_LITE_MODEL,
    name: "Gemini 3.1 Flash Lite Preview",
    provider: "google",
    description: "Lightweight multimodal model",
  },
];

export const allowedModelIds = new Set(chatModels.map((model) => model.id));

export const isDemo = false;

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  return {
    [DEFAULT_CHAT_MODEL]: {
      tools: true,
      vision: false,
      reasoning: true,
    },
    [GEMINI_FLASH_MODEL]: {
      tools: true,
      vision: true,
      reasoning: true,
    },
    [GEMINI_PRO_MODEL]: {
      tools: true,
      vision: true,
      reasoning: true,
    },
    [GEMINI_LITE_MODEL]: {
      tools: true,
      vision: true,
      reasoning: true,
    },
  };
}

export async function getAllGatewayModels() {
  const capabilities = await getCapabilities();
  return chatModels.map((model) => ({
    ...model,
    capabilities: capabilities[model.id],
  }));
}
