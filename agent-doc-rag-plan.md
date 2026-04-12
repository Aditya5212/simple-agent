# Agent Document + RAG Plan (R2 + LlamaIndex + Mastra)

## Goal
Build a reliable document ingestion and retrieval system for agent chat using:
- Cloudflare R2 for file storage (images + documents)
- LlamaIndex parser for document extraction/chunking prep
- Mastra pgvector flow for RAG retrieval
- Agent tool interface to inject grounded context into chat

## Decisions (Locked)
1. Storage: Cloudflare R2 is source of truth for uploaded files.
2. Parsing: LlamaIndex parser runs asynchronously after upload.
3. Retrieval: pgvector-backed semantic retrieval via Mastra flow/tool.
4. Security: all read/write operations are user-scoped (no client-trusted ownership).
5. Chat integration: RAG retrieval is exposed to the agent as a tool, not inline ad-hoc query logic.

## End-to-End Flow
1. User uploads file to API.
2. API stores object in R2 and creates a `Document` + `IngestionJob` record.
3. Worker picks pending job and calls parser.
4. Parsed text is chunked and normalized.
5. Embeddings are generated and upserted into pgvector store.
6. `Document` status becomes `ready`.
7. Agent tool retrieves top-k chunks with metadata filters and returns citations.
8. Chat response includes grounded context and source references.

## Proposed API Surface

### Upload + Document Lifecycle
1. `POST /api/files/upload`
- Upload file and persist to R2.
- Creates `Document` + queued `IngestionJob`.

2. `GET /api/documents`
- List user documents with status (`queued|processing|ready|failed`).

3. `GET /api/documents/:documentId`
- Fetch one document metadata.

4. `DELETE /api/documents/:documentId`
- Delete DB records + R2 object + vectors/chunks.

5. `POST /api/documents/:documentId/reprocess`
- Requeue parser/embedding pipeline.

### Ingestion Monitoring
1. `GET /api/documents/:documentId/status`
- Returns ingestion phase, progress, error details, timestamps.

2. `GET /api/ingestion/jobs/:jobId`
- Optional debug endpoint for operations/support.

### Retrieval (Internal-facing preferred)
1. `POST /api/rag/retrieve` (optional external endpoint)
- Retrieve filtered top-k chunks for debugging.

Primary path should be through Mastra tool execution, not direct frontend retrieval.

## Data Model (Additions)

### `Document`
1. `id`
2. `userId`
3. `sessionId` (optional, if file attached to a specific session)
4. `filename`
5. `mimeType`
6. `sizeBytes`
7. `r2Key`
8. `checksum`
9. `status` (`queued|processing|ready|failed`)
10. `errorMessage` (nullable)
11. `metadata` (JSON)
12. `createdAt`, `updatedAt`

### `IngestionJob`
1. `id`
2. `documentId`
3. `userId`
4. `status` (`queued|processing|completed|failed`)
5. `attempt`
6. `phase` (`upload|parse|chunk|embed|index`)
7. `errorMessage` (nullable)
8. `startedAt`, `completedAt`
9. `metadata` (JSON)

### `DocumentChunk` (optional relational mirror)
1. `id`
2. `documentId`
3. `userId`
4. `chunkIndex`
5. `text`
6. `tokenCount`
7. `metadata` (page, heading, source offsets)
8. `createdAt`

Note: vectors can live only in pgvector index, but keeping a relational chunk mirror helps debugging and audits.

## Retrieval Contract for Agent Tool
Tool name example: `retrieveSessionDocuments`

Input:
1. `query: string`
2. `sessionId?: string`
3. `documentIds?: string[]`
4. `topK?: number`

Behavior:
1. Resolve authenticated user scope server-side.
2. Filter candidate vectors by `userId` (+ optional `sessionId`/`documentIds`).
3. Return top-k chunks + citations:
- `documentId`
- `filename`
- `page` (if available)
- `chunkIndex`
- `score`

Output:
1. `context`: compact chunk bundle for model prompt
2. `citations`: structured references for UI rendering

## Security + Isolation Requirements
1. Never trust client-provided `userId`, `resourceId`, or vector filters.
2. Every document and retrieval query must be constrained to authenticated `userId`.
3. Use signed URLs for private object access if direct file retrieval is needed.
4. Validate MIME and size before upload.
5. Store checksum to detect duplicate uploads and prevent unnecessary re-indexing.

## Operational Requirements
1. Ingestion must be async (queue/worker) to keep chat latency low.
2. Add retries with backoff for parser and embedding failures.
3. Mark stale `processing` jobs as failed after timeout window.
4. Emit structured logs with `documentId`, `jobId`, `sessionId`, `userId`.

## Integration with Current Session Model
1. Keep session as user-facing chat container.
2. Optionally bind document to session on upload for scoped retrieval.
3. Keep thread mapping canonical:
- `threadId = userId-sessionId`
- `resourceId = sessionId-userId`
4. RAG tool uses same user/session context already used by `/api/agent/chat`.

## Rollout Plan

### Phase 1: Storage + Metadata
1. Implement `POST /api/files/upload` with R2 + DB metadata.
2. Implement `GET /api/documents` and `GET /api/documents/:id`.
3. Implement `DELETE /api/documents/:id`.

### Phase 2: Parsing + Indexing
1. Add ingestion worker + `IngestionJob` table.
2. Integrate LlamaIndex parser.
3. Chunk + embed + upsert to pgvector.
4. Implement status endpoints.

### Phase 3: RAG Tool Integration
1. Implement Mastra retrieval flow/tool.
2. Add tool to agent config and prompt policy.
3. Return citations in chat responses.

### Phase 4: Quality + Guardrails
1. Add eval set (real user queries) and retrieval metrics.
2. Tune chunk size/top-k/filters.
3. Add observability dashboards and failure alerts.

## Open Questions
1. Max upload size and supported MIME list for v1?
2. Do we allow global user document retrieval or session-only by default?
3. Should duplicate files dedupe by checksum automatically?
4. Which embedding model is final for production cost/latency targets?