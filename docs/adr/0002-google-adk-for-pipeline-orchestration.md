# ADR-0002: Use Google ADK for Pipeline Orchestration and LLM Extraction

**Status:** Accepted  
**Date:** 2025-03-14  
**Deciders:** Parcela Hackathon Team

---

## Context

The Parcela platform requires an ingestion and extraction pipeline (Epic E0) that takes unstructured zoning code PDFs and produces structured, scored regulatory data. This pipeline has multiple sequential stages (fetch → parse → chunk → extract → validate → store), involves multiple LLM calls per jurisdiction, and must handle partial failures gracefully without corrupting downstream scores.

The team evaluated whether to implement this pipeline as a simple script, a workflow framework, or an agent-based system.

Additionally, the platform's LLM extraction layer (Epic E2) requires five separate extraction prompts per jurisdiction, each returning a typed value with a confidence tier. These prompts benefit from structured orchestration rather than ad hoc LLM calls.

---

## Decision

We will use the **Google Agent Development Kit (ADK)** for TypeScript to implement the ingestion and extraction pipeline and the LLM extraction layer.

Specifically:

- **E0 — Ingestion & Extraction Pipeline:** Implemented as an ADK `SequentialAgent` with sub-agents for each pipeline stage (fetch, parse, chunk, extract, validate, store).
- **E2 — LLM Extraction:** Each regulatory field extraction (lot size, height limits, density limits, parking minimums, setbacks) implemented as a dedicated ADK `LlmAgent` with a structured output schema returning field value + confidence tier. The five field extractions run as an ADK `ParallelAgent` within the pipeline to minimize batch processing time.
- **E0-3 — Failure handling:** ADK's agent loop handles tool call failures gracefully — a failed extraction sets confidence to Low and the pipeline continues rather than halting.
- **E0-4 — Validation:** An ADK tool confirmation (HITL) step gates suspicious extraction outputs before they are written to the database.

---

## Rationale

- **Sequential and Parallel workflow agents:** ADK provides `SequentialAgent` and `ParallelAgent` primitives that map directly to the pipeline's fetch-parse-chunk-extract-validate-store structure. This eliminates the need to hand-roll orchestration logic, error propagation, and state passing between stages.
- **Structured output:** ADK's `LlmAgent` supports typed output schemas, ensuring extracted fields return structured JSON (value + confidence tier) rather than free text requiring post-processing parsing.
- **Failure isolation:** ADK's agent loop isolates tool call failures per agent — a failed extraction for one field does not propagate to other fields or halt the pipeline, satisfying E0-3.
- **Deployment alignment:** ADK is optimized for deployment to Vertex AI Agent Engine and Cloud Run, which are the target deployment services on Google Cloud (see ADR-0001). This keeps the deployment path consistent.
- **TypeScript availability:** ADK for TypeScript (released December 2025) allows the pipeline to be implemented in the same language as the rest of the application stack, avoiding a Python/TypeScript split (see ADR-0001).
- **Demo value:** An ADK multi-agent pipeline is a concrete, inspectable artifact. ADK's built-in web UI allows the team to demonstrate the pipeline running step-by-step during the hackathon demo, directly supporting the "Technical Soundness" and "Explainability & Responsible AI" judging criteria.

---

## Scope: Where ADK Is and Is Not Used

| Component | Uses ADK? | Rationale |
|-----------|-----------|-----------|
| E0 — Ingestion & Extraction Pipeline | Yes | Core use case — sequential/parallel agent orchestration |
| E2 — LLM Extraction | Yes | Structured LlmAgent outputs with confidence tiers |
| E3 — RIS Scoring Engine | No | Pure arithmetic — no agent needed |
| E4 — Feasibility Modeling | No | Deterministic calculations from structured inputs |
| E5/E6 — UI | No | Standard Next.js/React components |
| E7 — Comparison View | No | Data rendering, not agentic |
| E8 — What-If Simulation | No (MVP) | Slider-driven RIS recalculation is deterministic; natural language simulation deferred to post-MVP |

---

## Alternatives Considered

- **Plain scripted pipeline (no framework):** Simpler to start but requires hand-rolling orchestration, error handling, retries, and state management. Harder to demonstrate step-by-step execution during the demo.
- **LangChain:** Mature Python ecosystem with strong LLM tooling. Ruled out because it would require a Python backend split from the TypeScript application stack (see ADR-0001), and ADK's TypeScript support now covers the same use cases.
- **LlamaIndex:** Strong for RAG and document ingestion pipelines. Could complement ADK for the chunking and retrieval stage but adds a dependency without replacing ADK's orchestration capabilities.

---

## Consequences

- The team must learn ADK for TypeScript, which is newer and has less community documentation than the Python ADK. Python ADK examples will serve as the primary reference and be adapted to TypeScript.
- The five LLM extraction calls per jurisdiction run in parallel via `ParallelAgent`, which increases Gemini API concurrency. Rate limits should be validated before the full batch run.
- Post-hackathon, the pipeline can be scaled to additional jurisdictions by deploying to Vertex AI Agent Engine without re-architecting the agent structure.
- The what-if simulation (E8) remains deterministic for MVP. If natural language simulation is added post-MVP (Stretch S-5), it can be implemented as an additional `LlmAgent` using the RIS scoring function as a tool, consistent with this ADR.
