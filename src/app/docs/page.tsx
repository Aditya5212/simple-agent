"use client";

import { useEffect, useState } from "react";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

type Endpoint = {
  id: string;
  section: string;
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  summary: string;
  description?: string;
  url: string;
  request?: string;
  response?: string;
  notes?: string;
};

type TestResult = {
  status?: number;
  statusText?: string;
  durationMs?: number;
  ok?: boolean;
  body?: string;
  error?: string;
};

const baseUrl = "http://localhost:3000";

const endpoints: Endpoint[] = [
  {
    id: "agent-chat-stream",
    section: "Agent",
    method: "POST",
    path: "/api/agent/chat",
    summary: "Stream session-aware agent chat",
    description:
      "Authenticated chat endpoint that streams AI SDK UI chunks, creates or reuses a session, and persists conversation status.",
    url: `${baseUrl}/api/agent/chat`,
    request: `{
  "agentType": "simple-agent",
  "sessionId": "session12345",
  "message": "Show me my medical data for the last month",
  "config": {
    "maxSteps": 5,
    "modelSettings": {
      "temperature": 0.2,
      "maxOutputTokens": 1024
    },
    "system": "Be concise and practical"
  }
}`,
  response: `text/event-stream (AI SDK UI stream chunks)`,
    notes: `UI streaming test example:
import { DefaultChatTransport } from "ai";
import { useChat } from "@ai-sdk/react";

const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({ api: "/api/agent/chat" }),
});

sendMessage({ text: "Plan my week" });

Session and thread mapping:
- sessionId is your persisted app conversation key.
- threadId is derived server-side as userId-sessionId.
- resourceId is derived server-side as sessionId-userId.

Tip: Test this while signed in so browser cookies are sent for auth.`,
  },
  {
    id: "agent-sessions-list",
    section: "Agent",
    method: "GET",
    path: "/api/agent/sessions",
    summary: "List sessions for current user",
    description:
      "Lists AI agent sessions for the authenticated user with sidebar-ready title and mapped thread info.",
    url: `${baseUrl}/api/agent/sessions?limit=20`,
    response: `{
  "items": [
    {
      "id": "session_123",
      "title": "Medication follow-up",
      "metadata": {
        "sessionId": "session_123",
        "threadId": "user_1-session_123",
        "resourceId": "session_123-user_1",
        "agentType": "simple-agent"
      },
      "thread": {
        "threadId": "user_1-session_123",
        "resourceId": "session_123-user_1",
        "title": "Medication follow-up"
      }
    }
  ],
  "pageInfo": {
    "limit": 20,
    "hasMore": false,
    "nextCursor": null
  }
}`,
    notes:
      "Title precautions: thread title is treated as user-facing source and session.title is synchronized to match for sidebar consistency.",
  },
  {
    id: "agent-sessions-create",
    section: "Agent",
    method: "POST",
    path: "/api/agent/sessions",
    summary: "Create a new session and backing thread",
    description:
      "Creates an AI session row and creates/syncs the canonical Mastra thread for that session.",
    url: `${baseUrl}/api/agent/sessions`,
    request: `{
  "title": "Insurance claim prep",
  "agentType": "simple-agent",
  "metadata": {
    "source": "sidebar-new-chat"
  }
}`,
    response: `{
  "session": {
    "id": "session_123",
    "title": "Insurance claim prep"
  },
  "thread": {
    "threadId": "user_1-session_123",
    "resourceId": "session_123-user_1",
    "created": true
  }
}`,
  },
  {
    id: "agent-session-get",
    section: "Agent",
    method: "GET",
    path: "/api/agent/sessions/{sessionId}",
    summary: "Get one session with metadata",
    description:
      "Loads one session, normalizes canonical thread/resource mapping, and syncs thread metadata if needed.",
    url: `${baseUrl}/api/agent/sessions/session_123`,
    response: `{
  "session": {
    "id": "session_123",
    "title": "Medication follow-up",
    "metadata": {
      "threadId": "user_1-session_123",
      "resourceId": "session_123-user_1"
    }
  },
  "thread": {
    "threadId": "user_1-session_123",
    "resourceId": "session_123-user_1",
    "metadata": {}
  },
  "stats": {
    "conversationCount": 3
  }
}`,
  },
  {
    id: "agent-session-patch",
    section: "Agent",
    method: "PATCH",
    path: "/api/agent/sessions/{sessionId}",
    summary: "Update session title/metadata",
    description:
      "Updates session title and/or metadata, then syncs thread title and metadata in Mastra.",
    url: `${baseUrl}/api/agent/sessions/session_123`,
    request: `{
  "title": "Renamed by user",
  "metadata": {
    "pinned": true
  }
}`,
    response: `{
  "session": {
    "id": "session_123",
    "title": "Renamed by user"
  },
  "thread": {
    "threadId": "user_1-session_123",
    "resourceId": "session_123-user_1"
  }
}`,
  },
  {
    id: "agent-session-delete",
    section: "Agent",
    method: "DELETE",
    path: "/api/agent/sessions/{sessionId}",
    summary: "Delete session and remove thread",
    description:
      "Deletes the session and attempts to delete the mapped Mastra thread.",
    url: `${baseUrl}/api/agent/sessions/session_123`,
    response: `{
  "deleted": true,
  "sessionId": "session_123",
  "threadId": "user_1-session_123",
  "threadDeleted": true
}`,
  },
  {
    id: "agent-session-history",
    section: "Agent",
    method: "GET",
    path: "/api/agent/sessions/{sessionId}/history",
    summary: "Get session history",
    description:
      "Returns memory recall history plus DB conversation rows for a session.",
    url: `${baseUrl}/api/agent/sessions/session_123/history?page=0&perPage=20`,
    response: `{
  "session": {
    "id": "session_123"
  },
  "thread": {
    "threadId": "user_1-session_123"
  },
  "memoryHistory": {
    "messages": []
  },
  "conversations": [],
  "pageInfo": {
    "page": 0,
    "perPage": 20,
    "totalConversations": 3
  }
}`,
  },
  {
    id: "agent-session-status",
    section: "Agent",
    method: "PATCH",
    path: "/api/agent/sessions/{sessionId}/status",
    summary: "Update session status",
    description:
      "Sets session status (active/completed/failed), updates conversation statuses, and syncs thread metadata state.",
    url: `${baseUrl}/api/agent/sessions/session_123/status`,
    request: `{
  "status": "completed"
}`,
    response: `{
  "session": {
    "id": "session_123",
    "metadata": {
      "lastStatus": "completed"
    }
  },
  "updatedConversations": 1,
  "thread": {
    "threadId": "user_1-session_123"
  }
}`,
  },
  {
    id: "agent-session-working-memory-get",
    section: "Memory",
    method: "GET",
    path: "/api/agent/sessions/{sessionId}/working-memory",
    summary: "Get working memory by session",
    description:
      "Session-centric wrapper over Mastra working memory using canonical session->thread mapping.",
    url: `${baseUrl}/api/agent/sessions/session_123/working-memory`,
    response: `{
  "sessionId": "session_123",
  "threadId": "user_1-session_123",
  "resourceId": "session_123-user_1",
  "workingMemory": "..."
}`,
  },
  {
    id: "agent-session-working-memory-put",
    section: "Memory",
    method: "PUT",
    path: "/api/agent/sessions/{sessionId}/working-memory",
    summary: "Update working memory by session",
    description:
      "Updates Mastra working memory for the session-mapped thread/resource pair.",
    url: `${baseUrl}/api/agent/sessions/session_123/working-memory`,
    request: `{
  "workingMemory": "User prefers concise summaries"
}`,
    response: `{
  "updated": true,
  "sessionId": "session_123",
  "threadId": "user_1-session_123",
  "resourceId": "session_123-user_1"
}`,
  },
  {
    id: "agent-request-messages",
    section: "Agent",
    method: "GET",
    path: "/api/agent/requests/{requestId}/messages",
    summary: "Get one request's input/output",
    description:
      "Fetches a single persisted agent request by requestId for the authenticated user, including session/thread mapping and usage fields.",
    url: `${baseUrl}/api/agent/requests/req_123/messages`,
    response: `{
  "request": {
    "requestId": "req_123",
    "conversationId": "conv_123",
    "status": "completed",
    "agentType": "simple-agent"
  },
  "session": {
    "id": "session_123",
    "title": "Insurance claim prep",
    "thread": {
      "threadId": "user_1-session_123",
      "resourceId": "session_123-user_1"
    }
  },
  "messages": {
    "userMessage": "Summarize my claim timeline",
    "aiResponse": "..."
  },
  "usage": {
    "inputTokens": 210,
    "outputTokens": 180,
    "totalCost": 0
  },
  "metadata": {}
}`,
  },
  {
    id: "users-me-get",
    section: "User",
    method: "GET",
    path: "/api/users/me",
    summary: "Get current user profile",
    description:
      "Returns authenticated user profile with basic usage counts.",
    url: `${baseUrl}/api/users/me`,
    response: `{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "Aditya",
    "image": null,
    "isAnonymous": false,
    "counts": {
      "sessions": 4,
      "conversations": 15,
      "chats": 8
    }
  }
}`,
  },
  {
    id: "users-me-patch",
    section: "User",
    method: "PATCH",
    path: "/api/users/me",
    summary: "Update current user profile",
    description:
      "Updates profile fields (`name`, `image`) for the authenticated user.",
    url: `${baseUrl}/api/users/me`,
    request: `{
  "name": "Aditya Sharma",
  "image": "https://example.com/avatar.png"
}`,
    response: `{
  "user": {
    "id": "user_123",
    "email": "user@example.com",
    "name": "Aditya Sharma",
    "image": "https://example.com/avatar.png"
  }
}`,
  },
  {
    id: "users-me-delete",
    section: "User",
    method: "DELETE",
    path: "/api/users/me",
    summary: "Delete current user",
    description:
      "Deletes the authenticated user and cascades DB data; also attempts to remove mapped agent threads.",
    url: `${baseUrl}/api/users/me`,
    response: `{
  "deleted": true,
  "userId": "user_123",
  "sessionsDeleted": 4,
  "threadsDeleted": 4,
  "threadsDeleteFailed": 0
}`,
    notes:
      "This is destructive. If called from UI, sign out and redirect after success.",
  },
  {
    id: "agent",
    section: "Agent",
    method: "POST",
    path: "/api/agent",
    summary: "Generate a response from the agent",
    description:
      "Send a prompt to the agent with optional formatting, model settings, and memory options. Returns generated text plus optional usage and message data.",
    url: `${baseUrl}/api/agent`,
    request: `{
  "message": "Explain React hooks",
  "threadId": "thread-123",
  "resourceId": "user-123",
  "config": {
    "maxSteps": 5,
    "modelSettings": {
      "temperature": 0.2,
      "maxOutputTokens": 1024
    },
    "formatting": {
      "responseFormat": "markdown",
      "tone": "detailed"
    },
    "include": {
      "usage": true,
      "messages": false
    }
  }
}`,
    response: `{
  "text": "...",
  "threadId": "thread-123",
  "resourceId": "user-123",
  "usage": {
    "tokens": 123
  }
}`,
  },
  {
    id: "embeddings",
    section: "Embeddings",
    method: "POST",
    path: "/api/embeddings",
    summary: "Generate embeddings for text",
    description:
      "Create embeddings for one or more inputs using the NVIDIA model. Use inputType to mark query versus passage.",
    url: `${baseUrl}/api/embeddings`,
    request: `{
  "input": "What is the capital of France?",
  "inputType": "query"
}`,
    response: `{
  "provider": "nvidia",
  "modelId": "nvidia/llama-3.2-nemoretriever-300m-embed-v1",
  "count": 1,
  "dimensions": 1024,
  "embeddings": [[0.01, 0.02, 0.03]]
}`,
  },
  {
    id: "threads-list",
    section: "Threads",
    method: "GET",
    path: "/api/threads",
    summary: "List threads for a resource",
    description:
      "List threads owned by a resource with pagination and sort order controls.",
    url: `${baseUrl}/api/threads?resourceId=user-123&page=0&perPage=20&orderBy=updatedAt&direction=DESC`,
    response: `{
  "threads": [
    {
      "id": "thread-123",
      "title": "Intro",
      "resourceId": "user-123",
      "createdAt": "2026-04-11T10:00:00.000Z",
      "updatedAt": "2026-04-11T10:05:00.000Z",
      "metadata": {}
    }
  ],
  "total": 1,
  "page": 0,
  "perPage": 20,
  "hasMore": false
}`,
  },
  {
    id: "threads-create",
    section: "Threads",
    method: "POST",
    path: "/api/threads",
    summary: "Create a thread",
    description:
      "Create a new thread tied to a resource with optional metadata.",
    url: `${baseUrl}/api/threads`,
    request: `{
  "resourceId": "user-123",
  "title": "New thread",
  "metadata": {
    "source": "docs"
  }
}`,
    response: `{
  "id": "thread-123",
  "title": "New thread",
  "resourceId": "user-123",
  "createdAt": "2026-04-11T10:00:00.000Z",
  "updatedAt": "2026-04-11T10:00:00.000Z",
  "metadata": {
    "source": "docs"
  }
}`,
  },
  {
    id: "threads-get",
    section: "Threads",
    method: "GET",
    path: "/api/threads/{threadId}",
    summary: "Get a thread",
    description:
      "Fetch a single thread by id. Pass resourceId as a query param to validate ownership.",
    url: `${baseUrl}/api/threads/thread-123`,
    response: `{
  "id": "thread-123",
  "title": "Intro",
  "resourceId": "user-123",
  "createdAt": "2026-04-11T10:00:00.000Z",
  "updatedAt": "2026-04-11T10:05:00.000Z",
  "metadata": {}
}`,
  },
  {
    id: "threads-update",
    section: "Threads",
    method: "PATCH",
    path: "/api/threads/{threadId}",
    summary: "Update a thread",
    description:
      "Patch a thread title and metadata in one call.",
    url: `${baseUrl}/api/threads/thread-123`,
    request: `{
  "title": "Renamed",
  "metadata": {
    "priority": "high"
  }
}`,
    response: `{
  "id": "thread-123",
  "title": "Renamed",
  "resourceId": "user-123",
  "createdAt": "2026-04-11T10:00:00.000Z",
  "updatedAt": "2026-04-11T10:06:00.000Z",
  "metadata": {
    "priority": "high"
  }
}`,
  },
  {
    id: "threads-delete",
    section: "Threads",
    method: "DELETE",
    path: "/api/threads/{threadId}",
    summary: "Delete a thread",
    description:
      "Delete a thread by id. Optionally include resourceId as a query param to validate.",
    url: `${baseUrl}/api/threads/thread-123`,
    response: `{
  "deleted": true,
  "threadId": "thread-123"
}`,
  },
  {
    id: "threads-messages",
    section: "Messages",
    method: "GET",
    path: "/api/threads/{threadId}/messages",
    summary: "List messages in a thread",
    description:
      "List messages for a thread with pagination, ordering, and optional search.",
    url: `${baseUrl}/api/threads/thread-123/messages?resourceId=user-123&page=0&perPage=40&direction=ASC`,
    response: `{
  "messages": [
    {
      "id": "msg-1",
      "role": "user",
      "content": "Hello",
      "createdAt": "2026-04-11T10:00:00.000Z",
      "threadId": "thread-123",
      "resourceId": "user-123",
      "type": "text"
    }
  ],
  "total": 1,
  "page": 0,
  "perPage": 40,
  "hasMore": false
}`,
  },
  {
    id: "threads-messages-delete",
    section: "Messages",
    method: "DELETE",
    path: "/api/threads/{threadId}/messages",
    summary: "Delete messages in a thread",
    description:
      "Delete specific messages by id within a thread.",
    url: `${baseUrl}/api/threads/thread-123/messages`,
    request: `{
  "messageIds": ["msg-1", "msg-2"]
}`,
    response: `{
  "deleted": 2,
  "threadId": "thread-123"
}`,
  },
  {
    id: "threads-clone",
    section: "Threads",
    method: "POST",
    path: "/api/threads/{threadId}/clone",
    summary: "Clone a thread",
    description:
      "Clone a thread into a new one with optional message limits and filters.",
    url: `${baseUrl}/api/threads/thread-123/clone`,
    request: `{
  "title": "Clone",
  "options": {
    "messageLimit": 10
  }
}`,
    response: `{
  "thread": { "id": "thread-456", "resourceId": "user-123" },
  "clonedMessages": []
}`,
  },
  {
    id: "threads-working-memory-get",
    section: "Memory",
    method: "GET",
    path: "/api/threads/{threadId}/working-memory",
    summary: "Get working memory",
    description:
      "Read working memory for a thread and resource.",
    url: `${baseUrl}/api/threads/thread-123/working-memory?resourceId=user-123`,
    response: `{
  "threadId": "thread-123",
  "resourceId": "user-123",
  "workingMemory": "..."
}`,
  },
  {
    id: "threads-working-memory-put",
    section: "Memory",
    method: "PUT",
    path: "/api/threads/{threadId}/working-memory",
    summary: "Update working memory",
    description:
      "Update working memory text for a thread and resource.",
    url: `${baseUrl}/api/threads/thread-123/working-memory`,
    request: `{
  "resourceId": "user-123",
  "workingMemory": "Updated memory"
}`,
    response: `{
  "updated": true,
  "threadId": "thread-123",
  "resourceId": "user-123"
}`,
  },
  {
    id: "threads-summary",
    section: "Threads",
    method: "POST",
    path: "/api/threads/{threadId}/summary",
    summary: "Summarize a thread",
    description:
      "Summarize a thread using recent messages; requires resourceId.",
    url: `${baseUrl}/api/threads/thread-123/summary`,
    request: `{
  "resourceId": "user-123"
}`,
    response: `{
  "threadId": "thread-123",
  "summary": "..."
}`,
  },
  {
    id: "threads-truncate",
    section: "Messages",
    method: "POST",
    path: "/api/threads/{threadId}/truncate",
    summary: "Truncate messages in a thread",
    description:
      "Delete older messages while keeping the last N.",
    url: `${baseUrl}/api/threads/thread-123/truncate`,
    request: `{
  "keepLast": 10
}`,
    response: `{
  "deleted": 5,
  "threadId": "thread-123"
}`,
  },
  {
    id: "threads-by-resource",
    section: "Messages",
    method: "GET",
    path: "/api/threads/by-resource",
    summary: "List messages by resource",
    description:
      "List messages across all threads for a resource.",
    url: `${baseUrl}/api/threads/by-resource?resourceId=user-123&page=0&perPage=40&direction=ASC`,
    response: `{
  "messages": [],
  "total": 0,
  "page": 0,
  "perPage": 40,
  "hasMore": false
}`,
  },
  {
    id: "threads-rename",
    section: "Threads",
    method: "PATCH",
    path: "/api/threads/{threadId}/rename",
    summary: "Rename a thread",
    description:
      "Rename a thread with a minimal payload.",
    url: `${baseUrl}/api/threads/thread-123/rename`,
    request: `{
  "title": "New title"
}`,
    response: `{
  "id": "thread-123",
  "title": "New title",
  "resourceId": "user-123"
}`,
  },
  {
    id: "threads-title",
    section: "Threads",
    method: "PUT",
    path: "/api/threads/{threadId}/title",
    summary: "Set thread title",
    description:
      "Set the thread title directly.",
    url: `${baseUrl}/api/threads/thread-123/title`,
    request: `{
  "title": "New title"
}`,
    response: `{
  "id": "thread-123",
  "title": "New title",
  "resourceId": "user-123"
}`,
  },
  {
    id: "threads-metadata",
    section: "Threads",
    method: "PATCH",
    path: "/api/threads/{threadId}/metadata",
    summary: "Update thread metadata",
    description:
      "Replace the thread metadata object.",
    url: `${baseUrl}/api/threads/thread-123/metadata`,
    request: `{
  "metadata": {
    "priority": "high"
  }
}`,
    response: `{
  "id": "thread-123",
  "metadata": {
    "priority": "high"
  }
}`,
  },
  {
    id: "threads-metadata-delete",
    section: "Threads",
    method: "POST",
    path: "/api/threads/{threadId}/metadata/delete",
    summary: "Clear thread metadata",
    description:
      "Clear all thread metadata fields.",
    url: `${baseUrl}/api/threads/thread-123/metadata/delete`,
    response: `{
  "id": "thread-123",
  "metadata": {}
}`,
  },
  {
    id: "threads-update-alt",
    section: "Threads",
    method: "POST",
    path: "/api/threads/{threadId}/update",
    summary: "Update thread (alt)",
    description:
      "Alternate update endpoint that accepts title and metadata together.",
    url: `${baseUrl}/api/threads/thread-123/update`,
    request: `{
  "title": "New title",
  "metadata": {
    "tag": "demo"
  }
}`,
    response: `{
  "id": "thread-123",
  "title": "New title",
  "metadata": {
    "tag": "demo"
  }
}`,
  },
  {
    id: "threads-messages-update",
    section: "Messages",
    method: "POST",
    path: "/api/threads/{threadId}/messages/update",
    summary: "Update messages",
    description:
      "Bulk update message content by id.",
    url: `${baseUrl}/api/threads/thread-123/messages/update`,
    request: `{
  "messages": [
    { "id": "msg-1", "content": "Updated content" }
  ]
}`,
    response: `{
  "threadId": "thread-123",
  "messages": []
}`,
  },
  {
    id: "threads-messages-clear",
    section: "Messages",
    method: "POST",
    path: "/api/threads/{threadId}/messages/clear",
    summary: "Clear all messages",
    description:
      "Delete all messages in a thread.",
    url: `${baseUrl}/api/threads/thread-123/messages/clear`,
    response: `{
  "deleted": 0,
  "threadId": "thread-123"
}`,
  },
  {
    id: "threads-messages-search",
    section: "Messages",
    method: "GET",
    path: "/api/threads/{threadId}/messages/search",
    summary: "Search messages",
    description:
      "Vector-search messages in a thread by query string.",
    url: `${baseUrl}/api/threads/thread-123/messages/search?q=react&resourceId=user-123`,
    response: `{
  "messages": [],
  "total": 0,
  "page": 0,
  "perPage": 40,
  "hasMore": false
}`,
  },
  {
    id: "threads-messages-range",
    section: "Messages",
    method: "GET",
    path: "/api/threads/{threadId}/messages/range",
    summary: "Filter messages by date range",
    description:
      "Filter messages in a thread by a start and end date.",
    url: `${baseUrl}/api/threads/thread-123/messages/range?startDate=2026-04-11&endDate=2026-04-12`,
    response: `{
  "messages": [],
  "total": 0,
  "page": 0,
  "perPage": 40,
  "hasMore": false
}`,
  },
  {
    id: "threads-history",
    section: "Messages",
    method: "GET",
    path: "/api/threads/{threadId}/history",
    summary: "Thread history (alias)",
    description:
      "History view of messages with pagination and optional search.",
    url: `${baseUrl}/api/threads/thread-123/history?resourceId=user-123&page=0&perPage=40`,
    response: `{
  "messages": [],
  "total": 0,
  "page": 0,
  "perPage": 40,
  "hasMore": false
}`,
    notes: "Same payload shape as /messages but with optional search + reminders.",
  },
  {
    id: "chat-post",
    section: "Chat",
    method: "POST",
    path: "/api/chat",
    summary: "Generate or continue chat",
    description:
      "Streams assistant output, persists messages, and creates a chat when needed.",
    url: `${baseUrl}/api/chat`,
    request: `{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "message": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "role": "user",
    "parts": [{ "type": "text", "text": "Write a short summary" }]
  },
  "selectedChatModel": "default",
  "selectedVisibilityType": "private"
}`,
    response: `SSE stream of UI message chunks; final messages are persisted in DB.`,
  },
  {
    id: "chat-delete",
    section: "Chat",
    method: "DELETE",
    path: "/api/chat?id={chatId}",
    summary: "Delete a chat",
    description:
      "Deletes a chat and related records for the authenticated owner.",
    url: `${baseUrl}/api/chat?id=550e8400-e29b-41d4-a716-446655440000`,
    response: `{
  "id": "550e8400-e29b-41d4-a716-446655440000"
}`,
  },
  {
    id: "chat-stream",
    section: "Chat",
    method: "GET",
    path: "/api/chat/{id}/stream",
    summary: "Chat stream heartbeat endpoint",
    description:
      "Currently returns 204; reserved endpoint for resumable stream support.",
    url: `${baseUrl}/api/chat/550e8400-e29b-41d4-a716-446655440000/stream`,
    response: `HTTP 204 No Content`,
  },
  {
    id: "messages-get",
    section: "Chat",
    method: "GET",
    path: "/api/messages?chatId={chatId}",
    summary: "Get chat messages with visibility metadata",
    description:
      "Returns UI messages and readonly state based on ownership and visibility.",
    url: `${baseUrl}/api/messages?chatId=550e8400-e29b-41d4-a716-446655440000`,
    response: `{
  "messages": [],
  "visibility": "private",
  "userId": "user-123",
  "isReadonly": false
}`,
  },
  {
    id: "history-get",
    section: "Chat",
    method: "GET",
    path: "/api/history",
    summary: "List current user's chats",
    description:
      "Supports cursor-style pagination via starting_after / ending_before.",
    url: `${baseUrl}/api/history?limit=10`,
    response: `{
  "chats": [],
  "hasMore": false
}`,
  },
  {
    id: "history-delete",
    section: "Chat",
    method: "DELETE",
    path: "/api/history",
    summary: "Delete all current user's chats",
    description:
      "Bulk deletes all chats for the authenticated user.",
    url: `${baseUrl}/api/history`,
    response: `{
  "deletedCount": 0
}`,
  },
  {
    id: "vote-get",
    section: "Chat",
    method: "GET",
    path: "/api/vote?chatId={chatId}",
    summary: "Get votes for a chat",
    description:
      "Returns all message votes for the chat when owned by current user.",
    url: `${baseUrl}/api/vote?chatId=550e8400-e29b-41d4-a716-446655440000`,
    response: `[
  { "chatId": "...", "messageId": "...", "isUpvoted": true }
]`,
  },
  {
    id: "vote-patch",
    section: "Chat",
    method: "PATCH",
    path: "/api/vote",
    summary: "Vote on a message",
    description:
      "Upserts up/down vote for a message inside a chat.",
    url: `${baseUrl}/api/vote`,
    request: `{
  "chatId": "550e8400-e29b-41d4-a716-446655440000",
  "messageId": "550e8400-e29b-41d4-a716-446655440001",
  "type": "up"
}`,
    response: `Message voted`,
  },
  {
    id: "document-get",
    section: "Artifacts",
    method: "GET",
    path: "/api/document?id={documentId}",
    summary: "Future route: Get document versions",
    description:
      "Legacy template endpoint for document version history. Not required for current R2 upload + signed URL flow.",
    url: `${baseUrl}/api/document?id=doc-123`,
    response: `[
  {
    "id": "doc-123",
    "title": "Draft",
    "kind": "text",
    "content": "..."
  }
]`,
    notes:
      "Future use: only implement/consume this when versioned document editing is introduced.",
  },
  {
    id: "document-post",
    section: "Artifacts",
    method: "POST",
    path: "/api/document?id={documentId}",
    summary: "Future route: Create or update document",
    description:
      "Legacy template endpoint for versioned/manual edits. Not part of the current R2-backed ingestion path.",
    url: `${baseUrl}/api/document?id=doc-123`,
    request: `{
  "title": "Draft",
  "kind": "text",
  "content": "Hello world",
  "isManualEdit": false
}`,
    response: `{
  "id": "doc-123",
  "title": "Draft",
  "kind": "text"
}`,
    notes:
      "Future use: keep for later editor/versioning workflows; current RAG upload flow uses POST /api/files/upload.",
  },
  {
    id: "document-delete",
    section: "Artifacts",
    method: "DELETE",
    path: "/api/document?id={documentId}&timestamp={iso}",
    summary: "Future route: Delete newer document snapshots",
    description:
      "Legacy snapshot-pruning endpoint tied to document versioning semantics.",
    url: `${baseUrl}/api/document?id=doc-123&timestamp=2026-04-11T10:00:00.000Z`,
    response: `{
  "count": 1
}`,
    notes:
      "Future use: not needed for immutable upload records in current R2 ingestion model.",
  },
  {
    id: "suggestions-get",
    section: "Artifacts",
    method: "GET",
    path: "/api/suggestions?documentId={documentId}",
    summary: "Future route: Get document suggestions",
    description:
      "Legacy suggestion endpoint for document editing/review flows. Not required for current upload + retrieval baseline.",
    url: `${baseUrl}/api/suggestions?documentId=doc-123`,
    response: `[
  {
    "id": "sug-1",
    "documentId": "doc-123",
    "originalText": "...",
    "suggestedText": "..."
  }
]`,
    notes:
      "Future use: enable when human-in-the-loop editing and suggestion UX is introduced.",
  },
  {
    id: "files-upload",
    section: "Artifacts",
    method: "POST",
    path: "/api/files/upload",
    summary: "Upload file to Cloudflare R2",
    description:
      "Uploads supported image/document files to Cloudflare R2, stores uploaded-document metadata, and queues ingestion job.",
    url: `${baseUrl}/api/files/upload`,
    request: `multipart/form-data with fields: file, sessionId (optional)`,
    response: `{
  "provider": "r2",
  "bucket": "my-bucket",
  "key": "documents/user_1/...-report.pdf",
  "url": "https://files.example.com/documents/user_1/...-report.pdf",
  "signedUrl": "https://...",
  "signedUrlExpiresAt": "2026-04-12T12:00:00.000Z",
  "document": {
    "id": "cmdoc123",
    "status": "queued",
    "sessionId": "cmsession123"
  },
  "ingestionJob": {
    "id": "cmjob123",
    "status": "queued",
    "phase": "upload"
  }
}`,
  },
  {
    id: "documents-signed-url",
    section: "Artifacts",
    method: "GET",
    path: "/api/documents/{documentId}/signed-url",
    summary: "Get signed document download URL",
    description:
      "Returns a short-lived signed URL for a user-owned uploaded document stored in Cloudflare R2.",
    url: `${baseUrl}/api/documents/cmdoc123/signed-url?expiresInSeconds=900`,
    response: `{
  "documentId": "cmdoc123",
  "bucket": "my-bucket",
  "key": "documents/user_1/...-report.pdf",
  "signedUrl": "https://...",
  "expiresInSeconds": 900,
  "expiresAt": "2026-04-12T12:00:00.000Z"
}`,
  },
  {
    id: "models-get",
    section: "Models",
    method: "GET",
    path: "/api/models",
    summary: "List model capabilities",
    description:
      "Returns curated model capabilities; demo mode may also include model list.",
    url: `${baseUrl}/api/models`,
    response: `{
  "model-id": {
    "input": ["text"],
    "output": ["text"]
  }
}`,
  },
  {
    id: "auth-guest",
    section: "Auth",
    method: "GET",
    path: "/api/auth/guest",
    summary: "Start guest sign-in",
    description:
      "If already authenticated, redirects home; otherwise signs in with guest credentials.",
    url: `${baseUrl}/api/auth/guest?redirectUrl=/`,
    response: `302 Redirect to auth flow or app root`,
  },
];

const sectionOrder = [
  "Agent",
  "Embeddings",
  "Threads",
  "Messages",
  "Memory",
  "Chat",
  "Artifacts",
  "Models",
  "Auth",
];

const methodStyles: Record<Endpoint["method"], string> = {
  GET: "bg-emerald-200 text-emerald-900",
  POST: "bg-blue-200 text-blue-900",
  PATCH: "bg-amber-200 text-amber-900",
  PUT: "bg-purple-200 text-purple-900",
  DELETE: "bg-rose-200 text-rose-900",
};

type CopyButtonProps = {
  value: string;
  label?: string;
};

function CopyButton({ value, label = "Copy" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-full border border-black/10 bg-white/80 px-3 py-1 text-xs font-medium text-black transition hover:-translate-y-0.5 hover:bg-white"
      aria-label={`Copy ${label}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

function buildEndpointUrl(endpoint: Endpoint, activeBaseUrl: string) {
  if (endpoint.url.startsWith(baseUrl)) {
    return endpoint.url.replace(baseUrl, activeBaseUrl);
  }
  if (endpoint.url.startsWith("http")) {
    return endpoint.url;
  }
  const normalizedBase = activeBaseUrl.endsWith("/")
    ? activeBaseUrl.slice(0, -1)
    : activeBaseUrl;
  const normalizedPath = endpoint.url.startsWith("/")
    ? endpoint.url
    : `/${endpoint.url}`;
  return `${normalizedBase}${normalizedPath}`;
}

function formatResponseBody(value: string) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

type FieldProps = {
  label: string;
  value: string;
  mono?: boolean;
  scroll?: boolean;
};

function Field({ label, value, mono: isMono, scroll }: FieldProps) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/70 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs uppercase tracking-[0.2em] text-black/50">
          {label}
        </div>
        <CopyButton value={value} label={label} />
      </div>
      <pre
        className={`whitespace-pre-wrap text-sm leading-relaxed ${
          isMono ? "font-(--font-mono)" : "font-(--font-display)"
        } ${scroll ? "max-h-64 overflow-auto" : ""}`}
      >
        {value}
      </pre>
    </div>
  );
}

function TestPanel({ endpoint, activeBaseUrl }: { endpoint: Endpoint; activeBaseUrl: string }) {
  const [url, setUrl] = useState(() => buildEndpointUrl(endpoint, activeBaseUrl));
  const [hasCustomUrl, setHasCustomUrl] = useState(false);
  const [payload, setPayload] = useState(endpoint.request ?? "");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadSessionId, setUploadSessionId] = useState("");
  const [result, setResult] = useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!hasCustomUrl) {
      setUrl(buildEndpointUrl(endpoint, activeBaseUrl));
    }
  }, [activeBaseUrl, endpoint, hasCustomUrl]);

  const bodyAllowed = endpoint.method !== "GET";
  const isMultipartUpload = endpoint.id === "files-upload";

  const handleSend = async () => {
    if (isMultipartUpload && !uploadFile) {
      setResult({ error: "Choose a file before sending the upload request." });
      return;
    }

    setIsRunning(true);
    setResult(null);
    const startedAt = performance.now();

    try {
      const headers: Record<string, string> = {};
      const trimmedPayload = payload.trim();
      const hasBody = bodyAllowed && trimmedPayload.length > 0;
      let body: BodyInit | undefined;

      if (isMultipartUpload) {
        const formData = new FormData();
        formData.append("file", uploadFile as File);

        const sessionId = uploadSessionId.trim();
        if (sessionId.length > 0) {
          formData.append("sessionId", sessionId);
        }

        body = formData;
      } else {
        if (hasBody) {
          headers["Content-Type"] = "application/json";
          body = trimmedPayload;
        }
      }

      const response = await fetch(url, {
        method: endpoint.method,
        headers,
        credentials: "include",
        body,
      });

      const durationMs = Math.round(performance.now() - startedAt);
      const text = await response.text();

      setResult({
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        durationMs,
        body: formatResponseBody(text),
      });
    } catch (error) {
      setResult({
        error: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="rounded-3xl border border-black/10 bg-white/75 p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-[0.2em] text-black/50">
          Live test
        </div>
        <button
          type="button"
          onClick={handleSend}
          disabled={isRunning}
          className="rounded-full border border-black/10 bg-black px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRunning ? "Running" : "Send"}
        </button>
      </div>

      <label className="text-xs uppercase tracking-[0.2em] text-black/50">
        URL
      </label>
      <div className="mt-2 flex items-center gap-2">
        <input
          value={url}
          onChange={event => {
            setHasCustomUrl(true);
            setUrl(event.target.value);
          }}
          className="flex-1 rounded-2xl border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold text-black shadow-sm"
        />
        <CopyButton value={url} label="Copy" />
      </div>

      {bodyAllowed ? (
        <div className="mt-4">
          {isMultipartUpload ? (
            <>
              <div className="text-xs uppercase tracking-[0.2em] text-black/50">
                Multipart form-data
              </div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <label className="rounded-2xl border border-black/10 bg-white/80 px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-black/60">
                  File
                  <input
                    type="file"
                    onChange={event => {
                      const nextFile = event.target.files?.[0] ?? null;
                      setUploadFile(nextFile);
                    }}
                    className="mt-2 block w-full cursor-pointer rounded-lg border border-black/10 bg-white px-2 py-1 text-xs normal-case tracking-normal"
                  />
                  <div className="mt-1 text-[10px] normal-case tracking-normal text-black/50">
                    Allowed: images, PDF, txt, markdown, doc, docx (max 20MB)
                  </div>
                </label>
                <label className="rounded-2xl border border-black/10 bg-white/80 px-3 py-2 text-[11px] uppercase tracking-[0.15em] text-black/60">
                  Session ID (optional)
                  <input
                    value={uploadSessionId}
                    onChange={event => setUploadSessionId(event.target.value)}
                    placeholder="cmsession123"
                    className="mt-2 block w-full rounded-lg border border-black/10 bg-white px-2 py-2 text-xs normal-case tracking-normal text-black font-(--font-mono)"
                  />
                </label>
              </div>
              {uploadFile ? (
                <div className="mt-2 text-[11px] text-black/60">
                  Selected: <span className="font-semibold">{uploadFile.name}</span> ({Math.round(uploadFile.size / 1024)} KB)
                </div>
              ) : null}
            </>
          ) : (
            <>
              <label className="text-xs uppercase tracking-[0.2em] text-black/50">
                Request body
              </label>
              <textarea
                value={payload}
                onChange={event => setPayload(event.target.value)}
                rows={Math.max(6, payload.split("\n").length)}
                placeholder="{}"
                className="mt-2 w-full rounded-2xl border border-black/10 bg-white/80 px-3 py-2 text-xs text-black shadow-sm font-(--font-mono)"
              />
            </>
          )}
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-[0.2em] text-black/50">
          <span>Response</span>
          <div className="flex items-center gap-2">
            {result?.durationMs !== undefined ? (
              <span className="text-[11px] tracking-[0.18em]">
                {result.durationMs}ms
              </span>
            ) : null}
            {result?.body ? (
              <CopyButton value={result.body} label="Copy response" />
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/80 p-3 text-xs font-semibold text-black shadow-sm">
          {result ? (
            result.error ? (
              <div className="text-rose-600">{result.error}</div>
            ) : (
              <>
                <div
                  className={`mb-3 inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${
                    result.ok ? "bg-emerald-200 text-emerald-900" : "bg-rose-200 text-rose-900"
                  }`}
                >
                  {result.status} {result.statusText}
                </div>
                <pre className="max-h-64 whitespace-pre-wrap overflow-auto font-(--font-mono)">
                  {result.body || "(empty response)"}
                </pre>
                {result.status === 401 ? (
                  <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                    Unauthorized usually means no auth cookie was sent. Sign in first via
                    <span className="mx-1 font-(--font-mono)">/api/auth/guest?redirectUrl=/docs</span>
                    and keep Base URL on the same origin where you are logged in.
                  </div>
                ) : null}
              </>
            )
          ) : (
            <div className="text-black/50">Run the request to see a response.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function EndpointCard({
  endpoint,
  index,
  activeBaseUrl,
}: {
  endpoint: Endpoint;
  index: number;
  activeBaseUrl: string;
}) {
  const resolvedUrl = buildEndpointUrl(endpoint, activeBaseUrl);

  return (
    <details
      className="group rounded-3xl border border-black/10 bg-white/60 p-5 shadow-sm backdrop-blur transition hover:-translate-y-1"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              methodStyles[endpoint.method]
            }`}
          >
            {endpoint.method}
          </span>
          <span className="text-base font-semibold text-black">
            {endpoint.path}
          </span>
        </div>
        <span className="text-sm text-black/60">{endpoint.summary}</span>
      </summary>
      <div className="mt-5 space-y-4">
        {endpoint.description ? (
          <div className="rounded-2xl border border-black/10 bg-white/70 p-4 text-sm text-black/70">
            {endpoint.description}
          </div>
        ) : null}
        <Field label="URL" value={resolvedUrl} mono />
        {endpoint.request ? (
          <Field label="Request DTO" value={endpoint.request} mono />
        ) : null}
        {endpoint.response ? (
          <Field label="Response DTO" value={endpoint.response} mono scroll />
        ) : null}
        {endpoint.notes ? (
          <div className="rounded-2xl border border-black/10 bg-white/70 p-4 text-sm text-black/70">
            {endpoint.notes}
          </div>
        ) : null}
        <TestPanel endpoint={endpoint} activeBaseUrl={activeBaseUrl} />
      </div>
    </details>
  );
}

export default function DocsPage() {
  const [activeBaseUrl, setActiveBaseUrl] = useState(() =>
    typeof window !== "undefined" ? window.location.origin : baseUrl
  );

  const sections = sectionOrder
    .map(section => ({
      title: section,
      items: endpoints.filter(item => item.section === section),
    }))
    .filter(section => section.items.length > 0);

  return (
    <div
      className={`${display.variable} ${mono.variable} min-h-screen bg-[#f7f4ef] text-black`}
    >
      <style jsx global>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes float {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-12px);
          }
        }
        @keyframes shimmer {
          0% {
            opacity: 0.6;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0.6;
          }
        }
        .fade-up {
          animation: fadeUp 0.6s ease-out both;
        }
      `}</style>
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-32 left-10 h-64 w-64 rounded-full bg-linear-to-br from-orange-200 via-rose-200 to-amber-100 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-10 h-72 w-72 rounded-full bg-linear-to-br from-emerald-200 via-lime-200 to-teal-100 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-10 h-36 w-36 -translate-x-1/2 rounded-full bg-linear-to-r from-blue-200 to-cyan-200 opacity-70 blur-2xl animate-[float_9s_ease-in-out_infinite]" />
        <header className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 pb-6 pt-14">
          <div className="fade-up inline-flex items-center gap-3 rounded-full border border-black/10 bg-white/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em]">
            API Docs
          </div>
          <h1 className="fade-up text-4xl font-semibold tracking-tight md:text-5xl">
            Simple Agent API Console
          </h1>
          <p className="fade-up max-w-2xl text-base text-black/70">
            Copy-ready URLs and request/response DTOs for your agent, embeddings, and
            thread workflows.
          </p>
          <div className="fade-up flex flex-wrap items-center gap-3">
            <label className="flex flex-1 flex-col gap-2 rounded-2xl border border-black/10 bg-white/70 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em]">
              Base URL
              <input
                value={activeBaseUrl}
                onChange={event => setActiveBaseUrl(event.target.value)}
                className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs normal-case tracking-normal text-black shadow-sm font-(--font-mono)"
              />
            </label>
            <CopyButton value={activeBaseUrl} label="Copy Base URL" />
          </div>
        </header>
      </div>

      <main className="mx-auto w-full max-w-6xl px-6 pb-20">
        <section className="fade-up mb-10 rounded-3xl border border-black/10 bg-white/70 p-6 shadow-sm">
          <div className="mb-3 text-xs uppercase tracking-[0.2em] text-black/50">
            Headers
          </div>
          <Field
            label="Common"
            value={`Content-Type: application/json`}
            mono
          />
        </section>

        {sections.map(section => (
          <section key={section.title} className="mb-14">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-2xl font-semibold tracking-tight">
                {section.title}
              </h2>
              <span className="text-sm text-black/50">
                {section.items.length} endpoints
              </span>
            </div>
            <div className="grid gap-5">
              {section.items.map((endpoint, index) => (
                <EndpointCard
                  key={endpoint.id}
                  endpoint={endpoint}
                  index={index}
                  activeBaseUrl={activeBaseUrl}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
