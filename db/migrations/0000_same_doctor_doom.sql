CREATE TYPE "public"."confidence_tier" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."pipeline_status" AS ENUM('running', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TABLE "extracted_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"field_name" text NOT NULL,
	"raw_value" numeric,
	"raw_unit" text,
	"field_value" numeric,
	"field_value_text" text,
	"unit" text,
	"confidence" "confidence_tier" NOT NULL,
	"source_document" text,
	"source_section" text,
	"district_context" text,
	"pipeline_run_id" uuid,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feasibility_outputs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"max_units_per_acre" numeric(8, 2),
	"parking_footprint_pct" numeric(5, 2),
	"cost_per_sqft" numeric(8, 2),
	"estimated_cost_per_unit" numeric(10, 2),
	"regional_cost_multiplier" numeric(4, 3),
	"fmr_2br" numeric(8, 2),
	"rent_feasibility_ratio" numeric(6, 3),
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pipeline_run_id" uuid,
	CONSTRAINT "feasibility_outputs_jurisdiction_id_unique" UNIQUE("jurisdiction_id")
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"state" text NOT NULL,
	"fips_state" char(2) NOT NULL,
	"fips_county" char(3) NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"status" "pipeline_status" DEFAULT 'running' NOT NULL,
	"fields_extracted" integer DEFAULT 0 NOT NULL,
	"fields_failed" integer DEFAULT 0 NOT NULL,
	"source_document" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "ris_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"ris_composite" numeric(5, 2) NOT NULL,
	"dci" numeric(5, 2) NOT NULL,
	"dcoi" numeric(5, 2) NOT NULL,
	"pci" numeric(5, 2) NOT NULL,
	"crp" numeric(5, 2) NOT NULL,
	"peer_set" text[],
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pipeline_run_id" uuid,
	CONSTRAINT "ris_scores_jurisdiction_id_unique" UNIQUE("jurisdiction_id")
);
--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extracted_fields" ADD CONSTRAINT "extracted_fields_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_outputs" ADD CONSTRAINT "feasibility_outputs_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_outputs" ADD CONSTRAINT "feasibility_outputs_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ris_scores" ADD CONSTRAINT "ris_scores_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ris_scores" ADD CONSTRAINT "ris_scores_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action;