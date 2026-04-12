# Template API Mapping: chatbot-ref/chatbot -> simple-agent

Date: 2026-04-12

## Readiness Verdict

Yes, you can start the UI migration now.

- Core template API surface exists in your app at the same paths.
- Most routes are fully compatible.
- Two practical adapters are needed for smooth template UI parity:
  1. Upload response shape adapter (`pathname` expectation).
  2. Optional artifact/tooling parity if you want full template artifact UX.

## Route Mapping (Template -> Current App)

| Template Route | Methods | Current Route | Status | Notes for UI Migration |
|---|---|---|---|---|
| `/api/auth/guest` | `GET` | `/api/auth/guest` | Compatible | Same behavior. |
| `/api/auth/[...nextauth]` | `GET, POST` | `/api/auth/[...nextauth]` | Compatible | Re-exported handlers in both. |
| `/api/chat` | `POST, DELETE` | `/api/chat` | Compatible with backend implementation change | Contract remains usable for template hooks (`useChat`); implementation uses Mastra stream now. |
| `/api/chat/[id]/stream` | `GET` | `/api/chat/[id]/stream` | Compatible | Same no-content heartbeat endpoint (`204`). |
| `/api/document` | `GET, POST, DELETE` | `/api/document` | Compatible | Equivalent request/response behavior. |
| `/api/files/upload` | `POST` | `/api/files/upload` | Compatible with adapter | Current API is richer (R2 + ingestion metadata), but template UI expects `{ url, pathname, contentType }`. |
| `/api/history` | `GET, DELETE` | `/api/history` | Compatible | Query semantics (`limit`, `starting_after`, `ending_before`) preserved. |
| `/api/messages` | `GET` | `/api/messages` | Compatible | Same route and shape usage. |
| `/api/models` | `GET` | `/api/models` | Compatible | Same payload contract (capabilities / models in demo). |
| `/api/suggestions` | `GET` | `/api/suggestions` | Compatible | Same route and use-case. |
| `/api/vote` | `GET, PATCH` | `/api/vote` | Compatible | Same route semantics. |

## Known Contract Differences

### 1) File Upload Response

Template UI upload handler currently expects:

```json
{ "url": "...", "pathname": "...", "contentType": "..." }
```

Current API returns an expanded shape including:

- `url`
- `signedUrl`
- `filename`
- `contentType`
- `document`
- `ingestionJob`
- `pipeline`

Migration note:

- In UI upload handler, map `name` as `pathname ?? filename ?? key`.
- Use `signedUrl` when `url` is `null`.

### 2) Chat Backend Behavior (Not Path Contract)

- Template route streams from direct model + artifact tools.
- Current route streams via Mastra agent (`simple-agent`).

Migration note:

- Core chat should work with same UI wiring.
- Full artifact tool UX from template may need additional backend/tool event parity later if required.

## Additional Current APIs (Not in Template, Useful for New UI Features)

These are available if you want to expose RAG/session controls in UI:

- `/api/agent`
- `/api/agent/chat`
- `/api/agent/sessions`
- `/api/agent/sessions/[sessionId]/*`
- `/api/threads/*`
- `/api/documents/[documentId]/parse`
- `/api/ingestion/jobs/[jobId]`
- `/api/ingestion/jobs/[jobId]/parse-result`
- `/api/rag/retrieve`

## Practical Migration Order

1. Port template UI components/pages as-is.
2. Keep template API path usage unchanged (`/api/chat`, `/api/history`, etc.).
3. Add only the upload response adapter in UI.
4. Verify core flows: auth, chat, history, vote, suggestions, models.
5. Decide whether to keep template artifact UX or align it to agent-first behavior.

## Evidence Files Compared

- [chatbot-ref/chatbot/app/(chat)/api/chat/route.ts](chatbot-ref/chatbot/app/(chat)/api/chat/route.ts)
- [src/app/(chat)/api/chat/route.ts](src/app/(chat)/api/chat/route.ts)
- [chatbot-ref/chatbot/app/(chat)/api/files/upload/route.ts](chatbot-ref/chatbot/app/(chat)/api/files/upload/route.ts)
- [src/app/(chat)/api/files/upload/route.ts](src/app/(chat)/api/files/upload/route.ts)
- [chatbot-ref/chatbot/components/chat/multimodal-input.tsx](chatbot-ref/chatbot/components/chat/multimodal-input.tsx)
