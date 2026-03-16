terraform {
  required_version = ">= 1.5"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Terraform state is stored locally for the hackathon.
  # To migrate to a remote GCS backend, replace this block with:
  #
  # backend "gcs" {
  #   bucket = "parcela-tf-state"
  #   prefix = "terraform/state"
  # }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# ---------------------------------------------------------------------------
# GCS bucket for raw zoning PDFs
# ---------------------------------------------------------------------------

resource "google_storage_bucket" "raw_data" {
  name                        = var.raw_data_bucket
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = false

  versioning {
    enabled = false
  }
}

# Grant the CI/CD service account read access so the pipeline can fetch PDFs.
resource "google_storage_bucket_iam_member" "pipeline_reader" {
  bucket = google_storage_bucket.raw_data.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${var.pipeline_service_account}"
}
