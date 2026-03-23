# ADR-0006: Use Google ADK LlmAgent for Chat Interface

**Status:** Accepted
**Date:** 2026-03-21
**Deciders:** Parcella Hackathon Team

---

## Context

Users can view scores and run what-if simulations, but cannot ask free-form questions about the policy data — e.g., "Why is Fairfax's parking score so high?", "What does Arlington's zoning code say about setbacks?", or "Are there affordable housing density bonuses?"

The platform already has extracted fields, scores, feasibility outputs, and full zoning ordinance PDFs in GCS. A chat interface backed by an LLM with tool access can surface this data conversationally, making it accessible to policy analysts who may not know which specific metric to look at.

---

## Decision

We use **Google ADK's `LlmAgent`** (v0.5.0 for TypeScript) to implement a conversational chat agent with three declared tools, served via a stateless API endpoint.

### Agent tools

| Tool | Purpose |
|---|---|
| `get_jurisdiction_data` | Returns extracted fields, RIS scores, feasibility outputs, and market data from the database |
| `get_pdf_text` | Fetches and parses the source PDF from GCS (real jurisdictions only); caches parsed text as `zoning/{slug}/parsed-text.txt` |
| `compute_feasibility` | Wraps the existing `computeFeasibility` function for live what-if calculations |

### API design

`POST /api/jurisdictions/[id]/chat` accepts `{ message, history }` and returns `{ reply }`. The API is stateless — conversation history is maintained client-side and passed with each request. Each request creates a fresh `InMemoryRunner` session via `runEphemeral()`.

### Model

Gemini 2.5 Flash via Vertex AI — chosen for cost/latency balance. Zoning ordinance PDFs (50–150K tokens parsed) fit within Gemini's context window, eliminating the need for RAG or embeddings.

---

## Rationale

- **ADK over raw Vertex AI calls:** ADK handles the tool-call loop (model calls tool → execute → inject result → model responds or calls another tool). Without ADK, the route handler would need to hand-roll this multi-turn loop, serialize tool results, and manage re-calls. ADK eliminates ~50 lines of boilerplate.
- **Long-context over RAG:** The full ordinance text (50–150K tokens) fits in Gemini's 1M token context window. A vector database or embedding pipeline would add infrastructure complexity without improving answer quality for documents of this size.
- **Stateless API:** No server-side session storage needed. Client sends full history with each request. This avoids new database tables, session cleanup logic, and scaling concerns.
- **History in user message:** Conversation history is embedded in the user message content rather than reconstructed as ADK session events. This avoids the complexity of replaying prior tool calls and is sufficient for the MVP use case.

---

## Alternatives Considered

- **Raw `@google-cloud/vertexai` calls:** Simpler dependency, but requires hand-rolling the tool execution loop. Identified as a fallback if ADK proves unstable at v0.5.0.
- **RAG with vector embeddings:** Would require a vector database (e.g., Vertex AI Vector Search), an embedding pipeline, and chunk retrieval logic. Unnecessary given the documents fit in context.
- **Server-side session persistence:** Would enable richer multi-turn context but adds a database table, cleanup cron, and scaling considerations. Deferred — client-side history is sufficient for MVP.

---

## Consequences

- `@google/adk` added as a production dependency (brings `@google/genai` and `zod` as transitive deps).
- The Cloud Run service requires `GOOGLE_GENAI_USE_VERTEXAI=TRUE`, `GOOGLE_CLOUD_PROJECT`, and `RAW_DATA_BUCKET` environment variables.
- The service account needs `roles/aiplatform.user` for Gemini access.
- PDF text is cached to GCS on first parse, reducing subsequent chat turn latency from ~5s to sub-second.
- The agent is instructed not to make policy recommendations, consistent with the platform's existing disclaimer.
