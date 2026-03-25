# Parcella — Hackathon Retrospective

> Focus on things not already captured in the ADRs. The ADK deferral story is in [ADR-0002](adr/0002-google-adk-for-pipeline-orchestration.md); the pipeline extract/load split rationale is in [ADR-0004](adr/0004-extract-then-load-pipeline-split.md). Reference those rather than repeating them here.

---

## What Worked Well

- **AI-assisted development at scale** — Using Claude Code as a pairing partner for feature implementation, test coverage, code review, and documentation allowed one person to ship work that would normally take a team of 2-3. Over 4 days: chat agent feature, comparison view maps, regional/national zoom, 60+ tests, 5 rounds of SonarCloud coverage improvements, and 15+ UX fixes from design feedback.

- **Tight feedback loops with UX review** — Our designer's detailed issue-by-issue feedback gave us concrete, actionable changes. The pattern of "open issue, open branch, fix, PR, merge" kept changes small and reviewable. We addressed 20+ UX issues in the final days.

- **GitHub workflow discipline** — Every change went through a branch and PR, even one-line CSS fixes. This made it easy to track what changed, when, and why. AI code reviewers (Copilot, Codex) caught real bugs: the race condition on jurisdiction switch, the PDF tool error handling, and several TypeScript type issues.

- **Existing architecture supported rapid feature addition** — The clean separation between API routes, business logic, and UI components meant we could add the chat agent, comparison maps, and zoom controls without refactoring existing code. The scoring engine's pure functions made What-If simulation straightforward.

---

## What Was Harder Than Expected

- **ADK TypeScript maturity** — Google ADK for TypeScript (v0.5.0) had sparse documentation compared to the Python SDK. The session management issue (`runEphemeral` vs manual session creation) cost debugging time in production. The intermittent empty response issue (#174) was caused by silent rate limiting inside the ADK agent loop, with no error thrown, no log entry, and no response.

- **Leaflet in a React/Next.js environment** — Server-side rendering conflicts, HMR "Map container already initialized" errors, and jsdom limitations in tests made every map change take longer than the actual logic. The `_leaflet_id` cleanup workaround was fragile.

- **SonarCloud "new code" coverage gate** — The 80% threshold on *new code* (not overall) meant every feature PR had to ship with tests or risk blocking the deploy pipeline. This was good discipline but added time to every change.

- **Coordinating parallel workstreams** — The extraction pipeline refactoring and our UI/UX work occasionally collided (schema changes breaking local dev, branch conflicts, test fixtures going stale). Communication via Slack and GitHub issues kept it manageable but not frictionless. Adopting Git worktrees for multi-agent development, allowing multiple AI coding agents to work on separate branches simultaneously in isolated working directories, helped mitigate collisions later in the build.

---

## What We'd Do Differently

- **Establish the UX review loop from day 1** — Our designer's feedback in the final days was the most impactful work we did. If we'd started that feedback cycle earlier, we'd have caught the information hierarchy issues (disclaimer placement, accordion content, comparison card ordering) before building features on top of them.

- **Pin the chat model and add retry from the start** — The intermittent chat failures in production were confusing for testers. Adding retry logic and explicit error logging should have been in the initial implementation, not a follow-up fix.

---

## What the Demo Revealed

- **Users care about source traceability more than scores** — The "View source" links to the original ordinance PDF got the strongest reaction. People wanted to verify the AI's work, not just trust the number. This validated the confidence badges and citation design.

- **The What-If simulation is the "aha" moment** — Adjusting parking minimums and seeing the RIS drop in real time made the policy impact tangible in a way that static scores don't. This is where the tool transitions from informational to actionable.

- **Comparison view needs more parity with the score panel** — Users expected the same depth of information (zone selection, What-If sliders) in comparison mode. The comparison view was built as a summary, but users treated it as a primary workspace.

---

## Domain Learnings

- **Zoning codes are wildly inconsistent across jurisdictions** — Same concept, different names, different structures. Arlington's ACZO is one document; Fairfax's Municode is structured completely differently. Per-zone extraction was necessary because a single "Fairfax parking minimum" doesn't exist. It varies by district.

- **The "most permissive multifamily zone" is the policy-relevant one** — Policy analysts care about what *could* be built, not what the most restrictive residential zone allows. Defaulting to the primary multifamily zone (not the averaged score) was the right call for the score panel.

- **Public data is available but not standardized** — HUD FMR, Census ACS, Census BPS, BLS OES, and BEA RPP all have different geographies, vintages, and access methods. Building a pipeline that normalizes across these sources is real infrastructure work, not a weekend project.
