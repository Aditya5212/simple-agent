// Minimal provider shim to return a LanguageModel compatible with the `ai` SDK calls.
// For proper usage, replace with real model resolution logic.
import type { LanguageModel } from "ai";

export function getLanguageModel(modelId?: string): LanguageModel {
  // Cast a simple fallback string to LanguageModel for type compatibility
  // in development. Replace with a proper model object when integrating.
  return (modelId ?? "gpt-4o-mini") as unknown as LanguageModel;
}
