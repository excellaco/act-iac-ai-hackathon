CREATE TYPE "public"."data_type" AS ENUM('real', 'synthetic');--> statement-breakpoint
ALTER TABLE "jurisdictions" ADD COLUMN "data_type" "data_type" DEFAULT 'real' NOT NULL;