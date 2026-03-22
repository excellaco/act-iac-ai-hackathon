CREATE TYPE "public"."multifamily_classification" AS ENUM('primary', 'permitted', 'limited', 'none');--> statement-breakpoint
CREATE TABLE "zone_extracted_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"zone_code" text NOT NULL,
	"zone_name" text,
	"multifamily_classification" "multifamily_classification" NOT NULL,
	"field_name" text NOT NULL,
	"raw_value" numeric,
	"raw_unit" text,
	"field_value" numeric,
	"field_value_text" text,
	"unit" text,
	"confidence" "confidence_tier" NOT NULL,
	"source_section" text,
	"source_page" integer,
	"pipeline_run_id" uuid,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "zone_extracted_fields_jurisdiction_id_zone_code_field_name_unique" UNIQUE("jurisdiction_id","zone_code","field_name")
);
--> statement-breakpoint
CREATE TABLE "zone_ris_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"zone_code" text NOT NULL,
	"zone_name" text,
	"multifamily_classification" "multifamily_classification" NOT NULL,
	"ris_composite" numeric(5, 2) NOT NULL,
	"dci" numeric(5, 2) NOT NULL,
	"dcoi" numeric(5, 2) NOT NULL,
	"pci" numeric(5, 2) NOT NULL,
	"crp" numeric(5, 2) NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pipeline_run_id" uuid,
	CONSTRAINT "zone_ris_scores_jurisdiction_id_zone_code_unique" UNIQUE("jurisdiction_id","zone_code")
);
--> statement-breakpoint
ALTER TABLE "feasibility_outputs" DROP CONSTRAINT "feasibility_outputs_jurisdiction_id_unique";--> statement-breakpoint
ALTER TABLE "feasibility_outputs" ADD COLUMN "zone_code" text DEFAULT '__avg__' NOT NULL;--> statement-breakpoint
ALTER TABLE "zone_extracted_fields" ADD CONSTRAINT "zone_extracted_fields_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_extracted_fields" ADD CONSTRAINT "zone_extracted_fields_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_ris_scores" ADD CONSTRAINT "zone_ris_scores_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "zone_ris_scores" ADD CONSTRAINT "zone_ris_scores_pipeline_run_id_pipeline_runs_id_fk" FOREIGN KEY ("pipeline_run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feasibility_outputs" ADD CONSTRAINT "feasibility_outputs_jurisdiction_id_zone_code_unique" UNIQUE("jurisdiction_id","zone_code");