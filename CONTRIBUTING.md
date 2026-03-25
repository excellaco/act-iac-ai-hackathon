# Contributing to Parcella

---

## Local Development Setup

### Prerequisites

- Node.js 20+
- Docker (for local PostgreSQL)
- `gcloud` CLI (for pipeline runs and GCS access)

### Install and run

```bash
npm install
docker compose up -d       # start local PostgreSQL on port 5433
npm run db:push            # apply schema to local DB
npm run db:seed:all        # seed jurisdictions, scores, market data
npm run dev                # start Next.js dev server at localhost:3000
```

Copy `.env.example` to `.env.local` and set required variables — see the [README](README.md#environment-variables) for the full list.

---

## Branch and PR Workflow

1. **Create a feature branch** from `main` before starting any work:
   ```bash
   git checkout main && git pull
   git checkout -b feature/<description>
   ```
2. **Open a GitHub issue** for the work if one doesn't exist.
3. **Move the issue to In Progress** when you start:
   ```bash
   gh issue edit <number> --add-label "in-progress"
   ```
4. **Before opening a PR**, move the issue to In Review:
   ```bash
   gh issue edit <number> --add-label "in-review"
   ```
5. **Open the PR** using `gh pr create`. Write the body to a temp file to avoid heredoc quoting issues.
6. **After the PR is merged**, close the issue:
   ```bash
   gh issue close <number>
   ```

---

## Code Quality

The CI pipeline runs these checks on every push to `main`. Run them locally before pushing:

```bash
npx tsc --noEmit   # TypeScript type check
npm run lint       # ESLint
npm test           # Jest unit and component tests
```

Tests live in `__tests__/`. Add tests for any new pipeline logic or scoring calculations.

---

## Running the Data Pipeline

The pipeline transforms zoning ordinance PDFs into scored data. See [`docs/data-pipeline.md`](docs/data-pipeline.md) for the full runbook including:

- Stage-by-stage commands
- How to review and approve pipeline artifacts
- Rejection and recovery guidance
- How to run via GitHub Actions

Always run `pipeline:load` and `pipeline:score` against the **cloud database** (`DATABASE_URL_MIGRATE`), not a local database.

---

## Documentation

When making significant changes, update the relevant docs:

| Change | Doc to update |
|--------|--------------|
| New or changed DB tables | [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md) |
| New pipeline stage or behavior | [`docs/data-pipeline.md`](docs/data-pipeline.md) |
| New GitHub Actions workflow | [`docs/cicd-infrastructure.md`](docs/cicd-infrastructure.md) |
| Architecture decision | Add an ADR in [`docs/adr/`](docs/adr/) |
| New LLM prompt | [`docs/LLM_PROMPT_TEMPLATES.md`](docs/LLM_PROMPT_TEMPLATES.md) |

---

## Infrastructure Changes

Terraform configuration lives in `infra/`. See [`infra/README.md`](infra/README.md) for plan/apply instructions.

The infrastructure GitHub Actions workflow (`infra.yml`) runs `terraform plan` automatically on PRs that touch `infra/`. To apply changes, trigger it manually via **Actions → Infrastructure → Run workflow** and select `apply`.
