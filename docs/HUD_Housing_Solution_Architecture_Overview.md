# HUD Housing Regulatory Intelligence Platform
## Solution Architecture Overview

**Version:** 1.0 — First Draft  
**Platform:** Google Cloud Platform (GCP)  
**Architecture Style:** Microservices (GKE / Cloud Run), Multi-Region  
**Compliance Posture:** FedRAMP, FISMA, NIST 800-53, HIPAA-adjacent, Zero Trust  
**Status:** Draft — for team review and GitHub check-in

---

## 1. Executive Summary

The HUD Housing Regulatory Intelligence Platform is a cloud-native solution built on Google Cloud Platform (GCP) that empowers federal, state, and local stakeholders to identify, analyze, and act on regulatory barriers to housing development across jurisdictions. The platform ingests data from a broad ecosystem of public and government sources — including HUD APIs, US Census data, geospatial feeds, zoning databases, and legal repositories — and applies artificial intelligence to surface actionable insights about permitting friction, zoning restrictions, cost burdens, and fair housing risk.

The architecture is organized into six discrete layers — Security, UI, API Gateway, Application (Microservices), Data, and AI/ML — each independently scalable, observable, and governed. By deploying on GCP's FedRAMP-authorized infrastructure with Assured Workloads and enforcing Zero Trust access controls at every boundary, the platform meets the security and compliance requirements expected of a federal housing program system. The end result is a modern, data-driven decision-support tool that makes regulatory complexity legible to policymakers, housing advocates, researchers, and government staff alike.

---

## 2. Platform Architecture — Layer by Layer

### Layer 0 — Security Perimeter (Zero Trust / BeyondCorp)

Security is not a single gate at the edge — it is enforced at every layer of the platform. Google Cloud Armor provides WAF and DDoS protection at the network perimeter, while Identity-Aware Proxy (IAP) implements BeyondCorp Zero Trust, ensuring that no user or service is trusted by default, regardless of network location. Cloud IAM enforces role-based access control (RBAC) with least-privilege principles across all GCP resources.

Sensitive credentials and API keys are stored exclusively in Secret Manager, and all data at rest is encrypted via Cloud KMS. VPC Service Controls create a hard boundary around sensitive data, preventing exfiltration even in the event of a compromised identity. The Security Command Center (SCC) provides continuous asset inventory and threat detection, while Chronicle SIEM aggregates and correlates security telemetry for real-time threat hunting. Firebase Auth / Identity Platform handles federated SSO for external users (HUD staff, jurisdiction users, researchers), and Cloud Audit Logs maintain a complete, tamper-evident record of all platform activity for FedRAMP and FISMA compliance. Assured Workloads enforces data residency and regulatory controls at the GCP organization level.

### Layer 1 — UI / Presentation Layer

The user-facing surface of the platform is a modern, responsive web application built on React / Next.js, delivered globally through Cloud CDN with a Global HTTPS Load Balancer handling traffic routing and TLS termination. The primary interface is a Regulatory Dashboard powered by Looker Studio, giving analysts and policymakers interactive visualizations of barrier scores, zoning maps, and housing trend data.

A dedicated GIS / Maps module powered by the Google Maps API renders geospatial layers — parcel data, zoning boundaries, opportunity zones, and barrier heat maps — directly in the browser. A mobile-responsive Progressive Web App (PWA) ensures the platform is accessible to field staff and jurisdiction users on any device. The design system is built on Material UI, providing a consistent, accessible component library across all interface surfaces.

### Layer 2 — API Gateway & Integration

All traffic from the UI layer — and from external system integrations — flows through Apigee API Gateway, which enforces rate limiting, OAuth 2.0 / OIDC authentication, JWT validation, quota management, and API versioning. This single control plane ensures that every API call is authenticated, authorized, and observable before it reaches any backend service.

Google Cloud Pub/Sub provides asynchronous messaging for high-throughput data ingestion events, decoupling external data source feeds from the application services that consume them. Eventarc routes GCP-native events (such as new file arrivals in Cloud Storage or Pub/Sub message delivery) to downstream services without tight coupling. Cloud Endpoints exposes gRPC and REST interfaces for internal service-to-service communication, while Cloud Tasks manages job queuing for long-running operations such as bulk regulatory analysis or report generation.

### Layer 3 — Application Layer (GKE Autopilot / Cloud Run Microservices)

The application logic is decomposed into purpose-built microservices, each deployed as a Cloud Run service on a GKE Autopilot cluster. This architecture enables independent scaling, deployment, and fault isolation for each capability. All services communicate over the Anthos Service Mesh (Istio), which enforces mutual TLS (mTLS) between services, provides fine-grained traffic management, and feeds distributed tracing data into Cloud Monitoring.

Key microservices include the **Regulatory Analysis Service** (parsing and scoring regulatory documents), the **Barrier Scoring Engine** (computing composite housing barrier scores per jurisdiction), the **Geospatial Mapping Service** (processing and serving GIS layers), the **Data Ingestion Service** (orchestrating feeds from external sources via Dataflow), the **Reporting & Export Service** (generating PDF/Excel/API outputs), the **Notification Service** (alerting stakeholders to barrier changes or data updates), and the **AI Search Service** (semantic search over the regulatory corpus via Vertex AI Search).

The cluster runs across two availability zones (Zone A and Zone B) with Horizontal Pod Autoscaling (HPA) in both zones. Zone B maintains replica deployments of critical services for failover continuity. Workload Identity Federation eliminates static service account keys, binding GKE workloads directly to GCP IAM principals. A Bastion Host accessed exclusively via Cloud IAP Tunnel provides secure administrative access without exposing SSH to the public internet.

### Layer 4 — Data Layer (Private Subnet)

The data layer is divided into two domains: **operational databases** for transactional, real-time workloads and a **data warehouse and lake** for analytics, batch processing, and ML training.

**Operational databases** include Cloud SQL (PostgreSQL) for user and authentication data, Cloud Spanner for globally consistent, ACID-compliant storage of regulatory records (chosen for its multi-region replication and horizontal scale), Firestore for real-time NoSQL storage of session state and user preferences, Bigtable for time-series metrics and high-throughput event data, and Memorystore (Redis) for distributed caching and session management. All databases are deployed with read replicas across availability zones and protected by Cloud Backup with point-in-time recovery (PITR).

**The data lake and warehouse** use Cloud Storage (GCS) as the raw ingestion zone and curated/archive zone, with Dataflow running streaming and batch ETL pipelines to transform and load data into BigQuery — the central analytics engine powering all dashboard reporting, ad hoc analysis, and ML training datasets. Dataproc (Apache Spark) handles large-scale batch processing and feature engineering for machine learning. Data Catalog manages metadata, lineage tracking, and data governance across the entire estate, while Dataplex enforces a Data Mesh governance model — tagging, classifying, and controlling access to datasets across organizational boundaries. Cloud DLP continuously scans data for PII and sensitive content.

### Layer 5 — AI / ML Layer (Google Vertex AI)

The AI layer is the platform's intelligence core, built entirely on Google Vertex AI. **Gemini** (Google's generative AI model) powers natural language analysis of zoning ordinances, regulatory text, and legal documents — enabling automated summarization, classification, and Q&A over the regulatory corpus. **Vertex AI Search** provides semantic search capabilities, allowing users to query regulations in plain language and receive ranked, contextually relevant results.

**AutoML Tables** trains the housing barrier risk scoring model on historical regulatory, demographic, and economic data — producing a composite score per jurisdiction that quantifies the severity and type of regulatory barriers. **Vertex AI Pipelines** orchestrates the full ML lifecycle: data preparation, training, evaluation, and deployment. **Vertex AI Feature Store** centralizes engineered features for reuse across models, reducing redundant computation. **Vertex Explainable AI** produces model transparency reports suitable for government audit and stakeholder review — critical for a federally funded program where algorithmic accountability matters. **BigQuery ML** enables in-database predictive analytics directly against the data warehouse without data movement. **Vertex AI Model Monitoring** detects data drift and model degradation in production, triggering automated retraining pipelines when performance thresholds are breached.

AI use cases supported by the platform include: NLP on zoning laws and land use regulations, housing barrier risk scoring, a regulatory Q&A chatbot, anomaly detection in permitting data, geospatial ML for opportunity zone identification, and fair housing risk assessment.

### Layer 6 — GCP Managed Services (Observability, Operations & Governance)

The operational backbone of the platform relies on GCP's managed services suite. **Cloud Monitoring (Ops Suite)** provides full-stack observability — metrics, dashboards, and alerting — while **Cloud Logging** centralizes logs from all services for audit and debugging. **Cloud Trace** and **Profiler** enable distributed tracing and performance profiling across the microservices mesh. **Error Reporting** aggregates and deduplicates application errors with automated alerting to on-call engineers.

**Deployment Manager and Terraform** implement Infrastructure as Code (IaC) for all GCP resources, ensuring reproducible, version-controlled infrastructure. **Cloud Scheduler** manages cron-based batch jobs (nightly data refreshes, weekly barrier score recalculations). **Cloud NAT and Private Service Connect** ensure that all outbound traffic from private subnets is controlled and auditable. **Cloud Interconnect / VPN** provides dedicated, encrypted connectivity to HUD agency networks and partner systems. **Org Policy Service** enforces guardrails across the GCP organization (e.g., restricting resource creation to approved regions, enforcing encryption at rest). **Cloud Billing** and cost management tooling track spend per environment and service, supporting chargeback and optimization.

---

## 3. CI/CD & DevSecOps Pipeline

The platform follows a GitOps model. All source code and infrastructure definitions are version-controlled in **GitHub**. Pull requests are managed via **Jira / Confluence** for traceability against product backlog items. On merge to the main branch, **Cloud Build** triggers automated CI pipelines that compile, lint, run unit tests, and perform **SAST / DAST security scanning via SonarQube**. Passing artifacts are published to **Artifact Registry** as signed Docker images. **Binary Authorization** enforces supply chain security — only images with valid attestations from Cloud Build are permitted to run in the GKE cluster.

**Cloud Deploy** orchestrates progressive delivery across environments: Dev → Test/QA → Staging → Production (Multi-Region). **Terraform / Config Connector** manages all infrastructure changes through code, with plan/apply stages gated on peer review. **Helm Charts** package and version Kubernetes manifests for each microservice. The result is a fully automated, auditable deployment pipeline where no human can push directly to production, and every deployed artifact is traceable to its source commit.

---

## 4. AWS to GCP Service Mapping

For team members familiar with AWS-based architectures, the following table maps equivalent services used in this platform:

| AWS Service | GCP Equivalent | Role in Platform |
|---|---|---|
| EC2 | Compute Engine / GKE Nodes | Container node compute |
| S3 | Cloud Storage (GCS) | Data lake, backups, artifacts |
| API Gateway | Apigee | API management, auth, rate limiting |
| Cognito | Firebase Auth / Identity Platform | User authentication, SSO |
| CloudFront | Cloud CDN | Edge caching, global delivery |
| CloudFormation | Terraform / Deployment Manager | Infrastructure as Code |
| CloudWatch | Cloud Monitoring + Logging | Observability, alerting |
| Lambda | Cloud Functions | Serverless event triggers |
| Fargate | Cloud Run | Serverless container execution |
| Elasticsearch | Vertex AI Search | Semantic / full-text search |
| MongoDB | Firestore / Bigtable | NoSQL document / time-series data |
| EMR / Spark | Dataproc | Batch ML and data processing |
| SNS | Pub/Sub | Async messaging, event bus |
| RDS | Cloud SQL / Cloud Spanner | Relational / globally consistent DB |

---

## 5. Key Non-Functional Requirements

| Concern | Approach |
|---|---|
| **High Availability** | Multi-AZ GKE node pools, Cloud Spanner multi-region, GCS dual-region buckets |
| **Scalability** | Horizontal Pod Autoscaling (HPA) on GKE, Cloud Run auto-scale to zero |
| **Security** | Zero Trust (BeyondCorp / IAP), mTLS (Anthos Service Mesh), VPC-SC, Cloud KMS |
| **Compliance** | FedRAMP Moderate via Assured Workloads, Cloud Audit Logs, Org Policy guardrails |
| **Observability** | Cloud Monitoring, Logging, Trace, Profiler, Error Reporting, Anthos Service Mesh telemetry |
| **Data Governance** | Dataplex (Data Mesh), Data Catalog, Cloud DLP, BigQuery row/column-level security |
| **Disaster Recovery** | Cloud Backup (PITR), GCS multi-region, Cloud Spanner multi-region write |
| **Cost Management** | Cloud Billing budgets + alerts, Cloud Run scale-to-zero, BigQuery on-demand pricing |

---

## 6. Open Questions & Next Steps

The following items are flagged for team discussion before moving to detailed design:

- **Data classification:** Confirm PII and sensitivity tiers for all external data sources (Census, LexisNexis, zoning feeds) to finalize DLP policies and VPC-SC perimeter scope.
- **Gemini model selection:** Determine whether to use Gemini via Vertex AI API (managed) or fine-tune a model on the regulatory corpus — the latter requires a training data curation workstream.
- **Jurisdiction onboarding model:** Define the intake process for new state/local jurisdiction data uploads — bulk vs. API-push, validation rules, and data quality SLAs.
- **Identity federation scope:** Confirm which external identity providers (PIV/CAC, SAML, OIDC) need to be integrated for HUD staff and jurisdiction users.
- **Multi-region active/active vs. active/passive:** Current diagram shows multi-region for DR. Determine if active/active is required for production SLAs or if active/passive (with defined RTO/RPO targets) is acceptable.
- **AI fairness review:** Establish a bias and fairness review process for the Barrier Risk Scoring Model before production deployment — particularly for outputs that may influence federal funding decisions.

---

## 7. Diagram Reference

The solution architecture diagram (`HUD_Housing_Solution_Architecture_v7.drawio`) is the authoritative visual reference for this document and is maintained in the same repository directory. It is editable in [draw.io / diagrams.net](https://app.diagrams.net).

---

*Document prepared by: Solution Architecture Team*  
*Last updated: 2026-03-22*  
*Classification: Internal — For Team Review*
