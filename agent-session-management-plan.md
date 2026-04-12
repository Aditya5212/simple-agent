# Agent Session Management API Plan

## Goal
Define a clean, product-facing API layer for agent chat sessions (ChatGPT/Gemini style) based on current project setup.

## Current Setup Summary
- Prisma already has session-ready models: User, Session, AIAgentConversation.
- Chat flow also exists separately with Chat and Message models.
- Thread APIs already exist and are useful as infrastructure, but too low-level for frontend product flows.
- Existing agent route is non-streaming and not fully session-centric.

## Design Principles
- User identity always comes from server auth.
- Never trust client-provided resource ownership.
- Session is the primary product object.
- Thread is internal memory plumbing behind a session.
- One write-ahead conversation row per request, then finalize after stream.

## Proposed Product APIs (V1)

### 1) Agent Chat Route
- POST /api/agent/chat
- Purpose: Start streaming agent response (SSE) for authenticated user.
- Request body:
  - message: string (required)
  - agentType: string (required, allowlisted)
  - sessionId: string (optional; create if missing)
- Response:
  - SSE stream events
  - final completion event with sessionId, requestId, status

### 2) Session Routes
- GET /api/agent/sessions
  - List user sessions with pagination and optional agentType filter.
- POST /api/agent/sessions
  - Create a new session explicitly (optional convenience endpoint).
- GET /api/agent/sessions/:sessionId
  - Get one session and metadata for authenticated owner.
- GET /api/agent/sessions/:sessionId/history
  - Return thread history for the session.
- PATCH /api/agent/sessions/:sessionId/status
  - Update status to active, completed, or failed.

### 3) Request-Level Retrieval
- GET /api/agent/requests/:requestId/messages
- Purpose: Fetch stored input/output for one agent request.

### 4) User CRUD (Minimal)
- GET /api/users/me
- PATCH /api/users/me
- DELETE /api/users/me

## Ownership and Security Rules
- Resolve user from auth in every route.
- Do not accept resourceId from client in product APIs.
- resourceId must be set internally to authenticated user id.
- sessionId must be validated against session.userId.
- threadId should be controlled by server and linked to session metadata.
- agentType must be validated via allowlist.

## DB Update Flow for POST /api/agent/chat
1. Authenticate user.
2. Validate request body.
3. Resolve session (or create new session).
4. Resolve/create thread for that session.
5. Insert AIAgentConversation row with:
   - status = active
   - requestId generated
   - userMessage set
   - aiResponse placeholder
6. Start SSE generation with memory:
   - thread = resolved threadId
   - resource = authenticated user id
7. On stream completion:
   - update aiResponse
   - update token/cost fields
   - set conversation status = completed
   - update session updatedAt
8. On stream error:
   - set conversation status = failed
   - save error in metadata
   - persist partial output if available

## Thread Integration Strategy
- Keep existing thread endpoints as internal/infrastructure endpoints.
- Session routes should call thread memory services internally.
- Frontend should primarily use session APIs, not raw thread APIs.

## Response Contract Recommendations
- Use cursor pagination for list endpoints.
- Return normalized metadata fields across session and conversation responses.
- Keep status enum strict: active, completed, failed.
- Include requestId in streaming completion payload for traceability.

## Rollout Plan
1. Implement POST /api/agent/chat with SSE + AIAgentConversation writes.
2. Implement GET /api/agent/sessions and GET /api/agent/sessions/:sessionId.
3. Implement GET /api/agent/sessions/:sessionId/history via thread recall.
4. Implement PATCH /api/agent/sessions/:sessionId/status.
5. Implement GET /api/agent/requests/:requestId/messages.
6. Add minimal GET/PATCH /api/users/me.
7. Add integration tests for ownership, status transitions, and stream finalization.

## Mapping to Reference Controller
- streaming chat request -> POST /api/agent/chat
- list sessions -> GET /api/agent/sessions
- get one session with history -> GET /api/agent/sessions/:sessionId and /history
- get request messages -> GET /api/agent/requests/:requestId/messages
- update session status -> PATCH /api/agent/sessions/:sessionId/status

## Open Questions to Finalize Before Build
- Should session be auto-created on first message or always pre-created?
- Do we keep both Chat/Message and Session/Conversation as separate products, or migrate one to the other?
- Should failed sessions be reopenable by setting status back to active?
- What is the maximum retained history window per session for cost control?
