ALTER TABLE "jurisdictions" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "jurisdictions" SET "slug" = lower(regexp_replace(name, '\s+', '-', 'g')) || '-' || lower(state) WHERE "slug" IS NULL;--> statement-breakpoint
ALTER TABLE "jurisdictions" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "jurisdictions" ADD CONSTRAINT "jurisdictions_slug_unique" UNIQUE("slug");