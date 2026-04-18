declare global {
  // Prevent duplicate worker boot in dev HMR cycles.
  var __simpleAgentIngestionWorkerStarted: boolean | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  if (globalThis.__simpleAgentIngestionWorkerStarted) {
    return;
  }

  const { createIngestionWorker } = await import("./src/workers/ingestion.worker");
  createIngestionWorker();
  globalThis.__simpleAgentIngestionWorkerStarted = true;

  console.info("[ingestion-worker] started via instrumentation.register()");
}
