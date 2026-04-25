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
import { getStorage } from "./storage";

let _mastraInstance: Mastra | null = null;
let _mastraInitPromise: Promise<Mastra> | null = null;

export async function getMastra(): Promise<Mastra> {
  if (_mastraInstance) return _mastraInstance;
  if (_mastraInitPromise) return _mastraInitPromise;

  _mastraInitPromise = (async () => {
    const { storage } = await getStorage();

    const isProd = process.env.NODE_ENV === "production";
    const cloudAccessToken = process.env.MASTRA_CLOUD_ACCESS_TOKEN;
    const exporters = [
      new DefaultExporter(),
      ...(isProd && cloudAccessToken
        ? [new CloudExporter({ accessToken: cloudAccessToken })]
        : []),
    ];

    const mastra = new Mastra({
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

    _mastraInstance = mastra;
    return mastra;
  })();

  return _mastraInitPromise;
}

export const mastra = new Proxy(
  {},
  {
    get(_target, prop: string) {
      return (...args: unknown[]) =>
        getMastra().then((m) => {
          const val = (m as any)[prop];
          if (typeof val === "function") return val.apply(m, args as any);
          return val;
        });
    },
  }
) as unknown as Mastra;
