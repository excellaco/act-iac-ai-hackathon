# infra — Terraform Infrastructure

Manages GCP infrastructure for Parcela that lives outside the CI/CD deploy pipeline.

**Currently provisions:**
- GCS bucket `parcela-raw-data` for raw zoning ordinance PDFs
- IAM binding granting the `github-actions` service account `objectViewer` on the bucket

Cloud Run and Cloud SQL are **not** managed here — Cloud Run is deployed by the CI/CD pipeline; Cloud SQL is provisioned manually.

---

## Prerequisites

- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5
- `gcloud` CLI installed and authenticated
- Editor or Owner role on `parcela-490518`

Authenticate:
```bash
gcloud auth application-default login
```

---

## First-time setup

```bash
cd infra
terraform init
```

---

## Plan and apply

```bash
terraform plan
terraform apply
```

Review the plan before confirming. On a clean project this creates two resources: the bucket and the IAM binding.

---

## Upload PDFs after apply

Once the bucket exists, upload zoning PDFs:

```bash
gcloud storage cp <file> gs://parcela-raw-data/zoning/<jurisdiction>/
```

Follow the naming convention in `data/raw/README.md`. Example:

```bash
gcloud storage cp loudoun_zoning_ordinance_2023_downloaded_20260316.pdf \
  gs://parcela-raw-data/zoning/loudoun/
```

Verify:
```bash
gcloud storage ls gs://parcela-raw-data/zoning/
```

---

## State

Terraform state is stored **locally** (`terraform.tfstate`) for hackathon simplicity. Do not commit `terraform.tfstate` — it is gitignored.

To migrate to a remote backend later, create a GCS state bucket and uncomment the `backend "gcs"` block in `main.tf`.
