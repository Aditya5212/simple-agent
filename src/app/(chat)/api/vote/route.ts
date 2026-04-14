import { auth } from "@/app/(auth)/auth";
import { ChatbotError } from "@/lib/errors";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter chatId is required."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:vote").toResponse();
  }

  return Response.json([], { status: 200 });
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { chatId?: string }
    | null;

  if (!body?.chatId) {
    return new ChatbotError(
      "bad_request:api",
      "Parameter chatId is required."
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatbotError("unauthorized:vote").toResponse();
  }

  return new Response("Vote recorded", { status: 200 });
}
