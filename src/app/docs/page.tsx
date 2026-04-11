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
];

const sectionOrder = ["Agent", "Embeddings", "Threads", "Messages", "Memory"];

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
          isMono ? "font-[var(--font-mono)]" : "font-[var(--font-display)]"
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
  const [result, setResult] = useState<TestResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (!hasCustomUrl) {
      setUrl(buildEndpointUrl(endpoint, activeBaseUrl));
    }
  }, [activeBaseUrl, endpoint, hasCustomUrl]);

  const bodyAllowed = endpoint.method !== "GET";

  const handleSend = async () => {
    setIsRunning(true);
    setResult(null);
    const startedAt = performance.now();

    try {
      const headers: Record<string, string> = {};
      const trimmedPayload = payload.trim();
      const hasBody = bodyAllowed && trimmedPayload.length > 0;

      if (hasBody) {
        headers["Content-Type"] = "application/json";
      }

      const response = await fetch(url, {
        method: endpoint.method,
        headers,
        body: hasBody ? trimmedPayload : undefined,
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
          <label className="text-xs uppercase tracking-[0.2em] text-black/50">
            Request body
          </label>
          <textarea
            value={payload}
            onChange={event => setPayload(event.target.value)}
            rows={Math.max(6, payload.split("\n").length)}
            placeholder="{}"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold text-black shadow-sm font-[var(--font-mono)]"
          />
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
                <pre className="max-h-64 whitespace-pre-wrap overflow-auto font-[var(--font-mono)]">
                  {result.body || "(empty response)"}
                </pre>
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
  const [activeBaseUrl, setActiveBaseUrl] = useState(baseUrl);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setActiveBaseUrl(window.location.origin);
    }
  }, []);

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
        <div className="pointer-events-none absolute -top-32 left-10 h-64 w-64 rounded-full bg-gradient-to-br from-orange-200 via-rose-200 to-amber-100 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-10 h-72 w-72 rounded-full bg-gradient-to-br from-emerald-200 via-lime-200 to-teal-100 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-10 h-36 w-36 -translate-x-1/2 rounded-full bg-gradient-to-r from-blue-200 to-cyan-200 opacity-70 blur-2xl animate-[float_9s_ease-in-out_infinite]" />
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
                className="rounded-xl border border-black/10 bg-white/80 px-3 py-2 text-xs font-semibold normal-case tracking-normal text-black shadow-sm font-[var(--font-mono)]"
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
