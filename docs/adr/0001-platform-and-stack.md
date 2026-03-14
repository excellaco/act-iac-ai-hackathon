# ADR-0001: Platform and Application Stack

**Status:** Accepted  
**Date:** 2025-03-14  
**Deciders:** Parcela Hackathon Team

---

## Context

The ACT-IAC AI Hackathon has a two-week timeline with a demo-ready prototype as the primary deliverable. The team needed to make early decisions on cloud platform and application stack that would remain stable for the duration of the build. Key constraints were:

- Demo must be publicly accessible via a hosted URL
- Stack must support AI/LLM integration natively
- TypeScript/JavaScript expertise available on the team
- Deployment must be achievable within the hackathon timeline without significant infrastructure overhead
- Judging criteria includes technical soundness and feasibility for adoption by government agencies

---

## Decision 1: Google Cloud as the Target Platform

We will deploy all infrastructure — API, database, pipeline, and frontend — to Google Cloud.

### Rationale

- **Vertex AI integration:** Google Cloud provides native access to Vertex AI and the Gemini model family, which is the target LLM for the extraction pipeline. Running the pipeline on the same platform as the models reduces latency and simplifies authentication.
- **ADK deployment target:** Google Agent Development Kit (ADK) is optimized for deployment to Vertex AI Agent Engine and Cloud Run — both Google Cloud services. Using Google Cloud as the platform keeps ADK deployment straightforward (see ADR-0002).
- **Cloud Run:** Provides a simple, containerized deployment path for the Next.js application and pipeline services without requiring Kubernetes or complex infrastructure configuration.
- **Government familiarity:** Google Cloud has an established FedRAMP-authorized footprint, which is relevant for a tool targeting federal and state housing agencies. This supports the "feasibility for adoption" judging criterion.

### Alternatives Considered

- **AWS:** Strong general-purpose platform but less direct integration with the ADK/Gemini ecosystem. Would require additional configuration to connect to Vertex AI services.
- **Azure:** Similar concern as AWS. Azure OpenAI Service is strong but the team's primary LLM target is Gemini.
- **Vercel:** Well-suited for Next.js deployment but not a full-stack cloud platform — does not provide a natural home for the extraction pipeline, vector store, or database.

### Consequences

- All infrastructure tooling (CI/CD, secrets management, database) will use Google Cloud equivalents (Cloud Run, Cloud SQL or Firestore, Secret Manager).
- Team members unfamiliar with Google Cloud will need to ramp up on core services.
- Post-hackathon scaling path is well-defined via Vertex AI Agent Engine.

---

## Decision 2: Next.js and TypeScript for the Application Stack

We will build the frontend and backend API using Next.js with TypeScript.

### Rationale

- **Full-stack in one repo:** Next.js API routes allow the backend API (serving RIS scores, handling search, triggering simulations) to live in the same codebase as the frontend dashboard. This reduces coordination overhead and keeps the hackathon repo coherent.
- **TypeScript:** Provides end-to-end type safety across the API response schema, database models, and UI components. This is particularly important for the RIS scoring engine where precision in data types directly affects score correctness.
- **ADK TypeScript support:** Google ADK released TypeScript support in December 2025, meaning the extraction pipeline agents can be written in the same language as the rest of the application (see ADR-0002).
- **Existing codebase:** The repository was initialized with Next.js and TypeScript before this ADR was written — the decision ratifies the existing setup.
- **Rapid UI development:** Next.js with React enables fast iteration on the dashboard, comparison view, and what-if simulation UI within the two-week timeline.

### Alternatives Considered

- **Python backend + React frontend:** Python is the more mature ADK language and has richer LLM tooling (LangChain, LlamaIndex). However, splitting into two repos/languages adds coordination overhead that is not justified at MVP scale given TypeScript ADK availability.
- **SvelteKit:** Lighter weight than Next.js but less team familiarity and a smaller ecosystem for the data visualization libraries needed (choropleth maps, chart components).

### Consequences

- The extraction pipeline will be implemented in TypeScript using ADK for TypeScript rather than the more mature Python ADK.
- Python ADK documentation and examples will need to be translated to TypeScript equivalents during development.
- All team members work in a single language and a single repo, reducing context switching.
