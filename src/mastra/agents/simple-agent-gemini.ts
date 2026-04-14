import { MODEL_CATALOG } from "../models";
import { createSimpleAgent } from "./simple-agent";

export const simpleAgentGeminiFlash = createSimpleAgent({
  id: "simple-agent-gemini-flash",
  name: "Simple Agent (Gemini Flash)",
  model: MODEL_CATALOG.geminiFlashPreview,
});

export const simpleAgentGeminiPro = createSimpleAgent({
  id: "simple-agent-gemini-pro",
  name: "Simple Agent (Gemini Pro)",
  model: MODEL_CATALOG.geminiProPreview,
});

export const simpleAgentGeminiLite = createSimpleAgent({
  id: "simple-agent-gemini-lite",
  name: "Simple Agent (Gemini Lite)",
  model: MODEL_CATALOG.geminiLitePreview,
});
