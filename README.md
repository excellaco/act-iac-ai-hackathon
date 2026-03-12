# act-iac-ai-hackathon
The repo for our ACT-IAC AI hackathon efforts.

## Stack
- Next.js + TypeScript
- Deployed to Google Cloud Run via GitHub Actions

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## CI/CD Pipeline

The pipeline triggers on every push to `main` and builds and deploys the app to Cloud Run.

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

### Next.js Configuration

Add `output: 'standalone'` to `next.config.ts`:
```ts
const nextConfig = {
  output: 'standalone',
};
export default nextConfig;
```
