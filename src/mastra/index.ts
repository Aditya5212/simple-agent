import { Mastra } from "@mastra/core";
import {
  CloudExporter,
  DefaultExporter,
  Observability,
  SensitiveDataFilter,
} from "@mastra/observability";
import { PinoLogger } from "@mastra/loggers";
import { simpleAgent } from "./agents/simple-agent";
import {
  simpleAgentGeminiFlash,
  simpleAgentGeminiLite,
  simpleAgentGeminiPro,
} from "./agents/simple-agent-gemini";
import { storage } from "./storage";

const isProd = process.env.NODE_ENV === "production";
const cloudAccessToken = process.env.MASTRA_CLOUD_ACCESS_TOKEN;
const exporters = [
  new DefaultExporter(),
  ...(isProd && cloudAccessToken
    ? [new CloudExporter({ accessToken: cloudAccessToken })]
    : []),
];

export const mastra = new Mastra({
  agents: {
    simpleAgent,
    simpleAgentGeminiFlash,
    simpleAgentGeminiPro,
    simpleAgentGeminiLite,
  },
  storage,
  observability: new Observability({
    configs: {
      default: {
        serviceName: "simple-agent",
        exporters,
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  logger: new PinoLogger({ name: "simple-agent", level: "info" }),
});
