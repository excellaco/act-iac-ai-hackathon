# act-iac-ai-hackathon
The repo for our ACT-IAC AI hackathon efforts.

## Use Case: AI-Powered Housing Regulatory & Development Feasibility Intelligence

This project tackles the challenge of navigating complex housing regulations and assessing development feasibility using AI. The goal is to provide an intelligent platform that helps users understand regulatory requirements and evaluate the feasibility of housing development projects.

[View the full use case description](https://custom.cvent.com/65595313E1D64207A6EA78F583793509/files/937ae00ec3ab46c6aebdb78bfbf7552c.docx)

## Stack
- Next.js + TypeScript
- Deployed to Google Cloud Run via GitHub Actions

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Testing

Tests are written in [Jest](https://jestjs.io/) using [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/).

Run the tests:
```bash
npm test
```

Tests are located in the `__tests__/` directory.

## CI/CD Pipeline

The pipeline triggers on every push to `main` and runs two jobs:

### quality job
Runs first and must pass before deployment:
1. Install dependencies
2. TypeScript type check (`tsc --noEmit`)
3. Lint (`eslint`)
4. Tests (`jest`)

### deploy job
Runs after `quality` passes:
1. Install dependencies
2. Build the Next.js app
3. Authenticate to GCP
4. Build and push Docker image to Artifact Registry
5. Deploy to Cloud Run

### GitHub Secrets Required

Add these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|--------|-------------|
| `GCP_SA_KEY` | JSON content of the GCP service account key |
| `GCP_PROJECT_ID` | Your GCP project ID |

### One-Time GCP Setup

**Create the Artifact Registry repository:**
```bash
gcloud artifacts repositories create excella-ai-hackathon \
  --repository-format=docker \
  --location=us-central1
```

**Create a service account and grant roles:**
```bash
gcloud iam service-accounts create github-actions

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

**Generate the JSON key:**
```bash
gcloud iam service-accounts keys create key.json \
  --iam-account=github-actions@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

Paste the contents of `key.json` into the `GCP_SA_KEY` GitHub secret.
