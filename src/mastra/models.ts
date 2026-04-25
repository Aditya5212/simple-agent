export type ModelConfig =
  | string
  | {
      id: `${string}/${string}` | `${string}/${string}/${string}`;
      url: string;
      apiKey?: string;
      headers?: Record<string, string>;
    };

export const MODEL_CATALOG = {
  nvidiaKimiK2: {
    id: "nvidia/moonshotai/kimi-k2-instruct",
    url: "https://integrate.api.nvidia.com/v1",
    apiKey: process.env.NVIDIA_API_KEY_KIMI,
    headers: process.env.NVIDIA_API_KEY_KIMI
      ? { Authorization: `Bearer ${process.env.NVIDIA_API_KEY_KIMI}` }
      : undefined,
  },
  geminiFlashPreview: "google/gemini-3-flash-preview",
  geminiProPreview: "google/gemini-3.1-pro-preview",
  geminiLitePreview: "google/gemini-3.1-flash-lite-preview",
} satisfies Record<string, ModelConfig>;
