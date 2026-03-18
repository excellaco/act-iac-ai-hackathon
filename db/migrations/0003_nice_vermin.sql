CREATE TABLE "market_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"fmr_2br" numeric(8, 2),
	"fmr_vintage" text,
	"total_housing_units" integer,
	"occupied_housing_units" integer,
	"total_population" integer,
	"acs_vintage" text,
	"permits_5plus" integer,
	"total_permits" integer,
	"permits_vintage" text,
	"retrieved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_data_jurisdiction_id_unique" UNIQUE("jurisdiction_id")
);
--> statement-breakpoint
ALTER TABLE "market_data" ADD CONSTRAINT "market_data_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE no action ON UPDATE no action;