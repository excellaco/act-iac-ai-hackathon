#!/usr/bin/env bash
# check-gcs-bucket.sh
#
# Verifies that the raw data GCS bucket is accessible before the pipeline runs.
# Exits 0 if accessible, 1 if not (with a clear error pointing to the fix).
#
# Usage:
#   ./scripts/check-gcs-bucket.sh
#
# Environment variables:
#   RAW_DATA_BUCKET — GCS bucket name (default: parcella-501012-raw-data)
#                     Set to empty string to skip check (local dev without GCS)

set -euo pipefail

# Distinguish between "not set" (use default) and "explicitly set to empty" (skip check).
if [[ "${RAW_DATA_BUCKET+x}" == "x" && -z "${RAW_DATA_BUCKET}" ]]; then
  echo "RAW_DATA_BUCKET is empty — skipping GCS check (local dev mode)"
  exit 0
fi

BUCKET="${RAW_DATA_BUCKET:-parcella-501012-raw-data}"

echo "Checking GCS bucket: gs://${BUCKET}"

GCLOUD_OUTPUT=$(gcloud storage ls "gs://${BUCKET}/" 2>&1)
GCLOUD_EXIT=$?

if [[ $GCLOUD_EXIT -eq 0 ]]; then
  echo "OK — bucket gs://${BUCKET} is accessible"
  exit 0
else
  echo ""
  echo "gcloud error:"
  echo "${GCLOUD_OUTPUT}"
  echo ""
  echo "ERROR: GCS bucket 'gs://${BUCKET}' is not accessible."
  echo ""
  echo "The pipeline requires this bucket to fetch zoning ordinance PDFs."
  echo "To create it, run Terraform from the infra/ directory:"
  echo ""
  echo "  cd infra"
  echo "  terraform init"
  echo "  terraform apply"
  echo ""
  echo "See infra/README.md for full setup instructions."
  exit 1
fi
