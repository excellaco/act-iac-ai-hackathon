variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "raw_data_bucket" {
  description = "GCS bucket name for raw zoning PDFs"
  type        = string
  default     = "parcela-490518-raw-data"
}

variable "pipeline_service_account" {
  description = "Service account email that the pipeline runs as (granted objectViewer on the raw data bucket)"
  type        = string
  default     = "github-actions@parcela-490518.iam.gserviceaccount.com"
}
