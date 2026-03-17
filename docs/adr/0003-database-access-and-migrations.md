# ADR-0003: Database Access, Schema Management, and Local Development

**Status:** Accepted
**Date:** 2026-03-17
**Deciders:** Parcela Hackathon Team

---

## Context

The Parcela platform uses Cloud SQL (PostgreSQL) as its primary datastore. Before implementation could begin, the team needed to make four related decisions:

1. How to manage and version the database schema
2. How developers connect to a database locally without requiring GCP credentials
3. Whether Cloud SQL infrastructure should be managed with Terraform
4. When database migrations are applied relative to deployment

The schema is expected to change frequently during the two-week hackathon — new fields added, types adjusted, tables restructured as extraction and scoring logic is refined. Any approach that adds friction to schema changes would slow down the entire team.

---

## Decision 1: Drizzle ORM for Schema Management and Migrations

We will use [Drizzle ORM](https://orm.drizzle.team/) to define the database schema in TypeScript and manage migrations with `drizzle-kit`.

### Rationale

- **Schema as TypeScript:** The schema definition lives in `db/schema.ts` as TypeScript objects. This gives end-to-end type safety from the database through the API to the UI — a typed query result matches the TypeScript interface without manual mapping.
- **Two-mode workflow suited to the hackathon timeline:** During active early development (schema changing frequently), `drizzle-kit push` applies schema changes directly to the local database with no migration file generated — fast iteration with no overhead. When a change is ready to apply to Cloud SQL, `drizzle-kit generate` produces a versioned migration file and `drizzle-kit migrate` applies it. This matches the actual development rhythm of a hackathon.
- **Migration safety for Cloud SQL:** Generated migration files are committed to git, reviewed in PRs, and applied deterministically. This prevents the "works on my machine" schema drift that hurts teams during late-stage integration.
- **TypeScript-native:** Integrates naturally with the existing Next.js / TypeScript stack (ADR-0001) without requiring a separate language or build step.

### Alternatives Considered

- **Custom migration runner (raw SQL files):** Simple and transparent but requires manual rollback logic and provides no schema diffing. Appropriate for a stable schema; too slow for a schema that will change daily in the first week.
- **Prisma:** More mature ecosystem and excellent TypeScript support, but the Prisma schema language is a separate DSL (not TypeScript), and `prisma migrate dev` is slower for rapid iteration than `drizzle-kit push`.
- **`node-postgres-migrations` / `db-migrate`:** Lightweight runners for raw SQL files. Good for stable schemas; same limitation as the custom runner for frequent changes.
- **No ORM, raw `pg` queries:** Maximum control and transparency, but requires manual type mapping and offers no schema management tooling.

### Consequences

- The schema is defined in `db/schema.ts` using Drizzle table definitions — not raw SQL.
- Generated migration files live in `db/migrations/` and are committed to git.
- During local development, `drizzle-kit push` is the primary workflow. Migration files are generated when changes are ready for Cloud SQL.
- All database queries in the pipeline and API use the Drizzle query builder for type safety.
- Team members need a brief orientation to Drizzle's schema definition syntax.

---

## Decision 2: Docker Compose for Local Development Database

We will provide a `compose.yml` at the repo root that starts a local PostgreSQL instance. This is the standard local development path.

### Rationale

- **No GCP credentials required:** Developers can run the full application stack locally without a GCP service account. This is particularly important for new team members or contributors who are not yet set up with GCP access.
- **Fast startup:** `docker compose up` starts a fresh Postgres instance in seconds. No proxy process, no tunnel, no credential rotation.
- **Isolation:** Local schema changes (`drizzle-kit push`) affect only the local container, not the shared Cloud SQL instance. Multiple developers can iterate on schema changes in parallel without conflict.
- **Parity via migrations:** When a developer is ready to apply their schema changes to Cloud SQL, they run `drizzle-kit generate` to produce a migration file and open a PR. The migration is applied to Cloud SQL on deploy, keeping environments in sync through versioned files rather than direct access.

### Alternatives Considered

- **Cloud SQL Auth Proxy (connect to real Cloud SQL locally):** Keeps all environments on identical data but requires GCP credentials on every developer machine, a running proxy process, and careful coordination to avoid clobbering each other's schema changes. Too much overhead for a hackathon team.
- **Cloud SQL with public IP:** Not recommended — exposes the database to the internet and requires IP allowlisting.

### Consequences

- A `compose.yml` is added to the repo root with a `postgres:16` service and a named volume.
- `DATABASE_URL` is the single environment variable controlling which database the app connects to.
- Local default: `postgresql://postgres:postgres@localhost:5432/parcela`
- Cloud Run / CI: `DATABASE_URL` stored in GitHub Secrets and GCP Secret Manager, using the Cloud SQL socket connection format.
- Developers are responsible for running `drizzle-kit push` after pulling schema changes locally.

---

## Decision 3: Cloud SQL Instance is Not Managed by Terraform

The Cloud SQL instance will not be managed with Terraform. The instance is provisioned manually and considered stable infrastructure for the duration of the hackathon.

### Rationale

- **Instance already exists:** The Cloud SQL instance was provisioned before this decision point. Importing it into Terraform state would add risk without benefit.
- **Cloud SQL is stateful and risky to automate:** Terraform managing a Cloud SQL instance controls machine type, storage size, deletion protection, and backup configuration. A `terraform destroy` or misconfigured resource block could permanently delete data. This risk is not justified for a two-week project.
- **Schema migrations are the right tool for database internals:** What goes *inside* the database (tables, types, indexes) is managed by Drizzle migrations, which are versioned in git and reviewed in PRs. Terraform is the right tool for cloud resource provisioning — not for schema management.
- **Scope boundary:** Terraform in `infra/` manages the GCS bucket (ADR implicitly — see `infra/main.tf`). Keeping Cloud SQL out of Terraform keeps the blast radius of `terraform apply` small and well-understood.

### Alternatives Considered

- **Import Cloud SQL into Terraform:** Provides a complete IaC picture but introduces risk of accidental destruction and significant setup overhead (importing existing state is error-prone).
- **Manage Cloud SQL schema changes via Terraform:** Not appropriate — Terraform has no concept of database migrations and cannot safely manage incremental schema changes.

### Consequences

- Cloud SQL instance provisioning and configuration (machine type, storage, backups) remain manual.
- `pgcrypto` extension must be enabled manually on the Cloud SQL instance (required for `gen_random_uuid()`).
- All schema changes are managed exclusively through Drizzle migration files.

---

## Decision 4: Migrations Auto-Apply on Deploy

Database migrations will run automatically as part of the CI/CD deploy job, before the application container starts.

### Rationale

- **No manual intervention required:** During a two-week hackathon with frequent deploys, requiring a developer to manually run migrations against Cloud SQL before each deploy adds friction and risk of forgetting.
- **Deploy atomicity:** The migration step runs after the Docker image is built and pushed but before Cloud Run is updated. If migrations fail, the deploy fails and the current version continues running — the application is never started against a schema it doesn't understand.
- **Appropriate risk level for MVP:** Auto-apply is riskier in production systems with live traffic. For a demo environment with no real users and a small team aware of every deploy, the operational risk is acceptable.

### Alternatives Considered

- **Manual migration runs:** Gives more control but requires a developer to have Cloud SQL access and remember to run migrations before each deploy. Easy to forget under time pressure.
- **Migration as a separate deploy step (manual trigger):** Provides explicit separation between schema changes and code changes but adds pipeline complexity not warranted at this scale.

### Consequences

- The deploy job in `.github/workflows/deploy.yml` includes a migrate step: `npx drizzle-kit migrate` with `DATABASE_URL` from GitHub Secrets.
- A failed migration blocks the deploy — the team must resolve the migration before the new code ships.
- The `db/migrations/` directory must be kept clean and reviewed in PRs like any other code change.

---

## Summary

| Decision | Choice |
|---|---|
| Schema management | Drizzle ORM (`db/schema.ts` + `drizzle-kit`) |
| Local dev database | Docker Compose (`postgres:16` container) |
| Cloud SQL infrastructure | Manual — not managed by Terraform |
| Migration timing | Auto-apply on deploy, before app starts |
