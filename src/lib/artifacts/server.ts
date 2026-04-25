// Lightweight shim for createDocumentHandler used by artifact server files.
// This is intentionally minimal and only provides typing to satisfy TypeScript.
export type DataStream = {
  write: (payload: unknown) => void;
};

export type CreateDocumentParams = {
  title?: string;
  document?: { content: string };
  description?: string;
  dataStream: DataStream;
  modelId?: string;
};

export type CreateDocumentHandlerOptions<K extends string> = {
  kind: K;
  onCreateDocument: (params: CreateDocumentParams) => Promise<string> | string;
  onUpdateDocument: (params: CreateDocumentParams) => Promise<string> | string;
};

export function createDocumentHandler<K extends string>(
  opts: CreateDocumentHandlerOptions<K>
): CreateDocumentHandlerOptions<K> {
  // This function intentionally returns the provided options. In the real
  // application this would register the handler with a document system.
  return opts;
}
