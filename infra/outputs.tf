output "raw_data_bucket_name" {
  description = "Name of the GCS bucket holding raw zoning PDFs"
  value       = google_storage_bucket.raw_data.name
}

output "raw_data_bucket_url" {
  description = "gs:// URL of the raw data bucket"
  value       = "gs://${google_storage_bucket.raw_data.name}"
}
