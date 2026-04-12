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

export const chatModels: ChatModel[] = [
  {
    id: DEFAULT_CHAT_MODEL,
    name: "Kimi K2 Instruct",
    provider: "nvidia",
    description: "Default chat model",
  },
];

export const allowedModelIds = new Set(chatModels.map((model) => model.id));

export const isDemo = false;

export async function getCapabilities(): Promise<
  Record<string, ModelCapabilities>
> {
  return {
    [DEFAULT_CHAT_MODEL]: {
      tools: false,
      vision: true,
      reasoning: false,
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
