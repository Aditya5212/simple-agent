import { smoothStream, streamText } from "ai";
import { updateDocumentPrompt } from "@/lib/ai/prompts";
import { getLanguageModel } from "@/lib/ai/providers";
import { createDocumentHandler } from "@/lib/artifacts/server";

export const textDocumentHandler = createDocumentHandler<"text">({
  kind: "text",
  onCreateDocument: async ({ title, dataStream, modelId }) => {
    if (!modelId) {
      throw new Error("modelId is required");
    }
    const model = getLanguageModel(modelId);
    if (!model) {
      throw new Error(`Language model not found: ${modelId}`);
    }

    let draftContent = "";

    const { fullStream } = streamText({
      model,
      system:
        "Write about the given topic. Markdown is supported. Use headings wherever appropriate.",
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: title ?? "",
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream, modelId }) => {
    if (!modelId) {
      throw new Error("modelId is required");
    }
    const model = getLanguageModel(modelId);
    if (!model) {
      throw new Error(`Language model not found: ${modelId}`);
    }

    let draftContent = "";

    const { fullStream } = streamText({
      model,
      system: updateDocumentPrompt(document?.content ?? "", "text"),
      experimental_transform: smoothStream({ chunking: "word" }),
      prompt: description ?? "",
    });

    for await (const delta of fullStream) {
      if (delta.type === "text-delta") {
        draftContent += delta.text;
        dataStream.write({
          type: "data-textDelta",
          data: delta.text,
          transient: true,
        });
      }
    }

    return draftContent;
  },
});
