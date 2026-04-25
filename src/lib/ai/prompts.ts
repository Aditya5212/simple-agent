// Minimal prompt stubs for type-checking and local development
export const codePrompt = `You are a code generator. Produce code only.`;
export const sheetPrompt = `You are a CSV generator. Produce raw CSV data only.`;

export function updateDocumentPrompt(currentContent: string, kind: string) {
  return `Update the existing ${kind} document. Current content: ${currentContent}`;
}

export const defaultSystemPrompt = `You are a helpful assistant.`;
