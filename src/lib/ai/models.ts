export type ModelCapabilities = {
  tools?: boolean;
  reasoning?: boolean;
};

export type ChatModel = {
  id: string;
  label: string;
  gatewayOrder?: string[];
  reasoningEffort?: "low" | "medium" | "high" | number;
};

export const DEFAULT_CHAT_MODEL = "nvidia/moonshotai/kimi-k2-instruct";

export const chatModels: ChatModel[] = [
  {
    id: DEFAULT_CHAT_MODEL,
    label: "Kimi K2",
  },
];

export const allowedModelIds = new Set(chatModels.map((model) => model.id));

export const isDemo = false;

export async function getCapabilities(): Promise<Record<string, ModelCapabilities>> {
  return {
    [DEFAULT_CHAT_MODEL]: {
      tools: false,
      reasoning: false,
    },
  };
}

export async function getAllGatewayModels() {
  const capabilities = await getCapabilities();
  return chatModels.map((model) => ({
    id: model.id,
    capabilities: capabilities[model.id],
  }));
}
