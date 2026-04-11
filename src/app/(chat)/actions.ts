"use server";

import type { ChatMessage } from "@/lib/types";
import { getTextFromMessage } from "@/lib/utils";

export async function generateTitleFromUserMessage({
  message,
}: {
  message: ChatMessage;
}) {
  const text = getTextFromMessage(message).trim();
  if (!text) return "New chat";
  return text.split(/\s+/).slice(0, 8).join(" ");
}
