CREATE TABLE "cost_centers" (
	"code" text PRIMARY KEY NOT NULL,
	"label" text
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"status" text,
	"source" text,
	"fetched" integer,
	"inserted" integer,
	"skipped" integer,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "default_cost_center" SET DATA TYPE text USING "default_cost_center"::text;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "cost_center" SET DATA TYPE text USING "cost_center"::text;--> statement-breakpoint
ALTER TABLE "rules" ALTER COLUMN "set_cost_center" SET DATA TYPE text USING "set_cost_center"::text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "cost_center" SET DATA TYPE text USING "cost_center"::text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_investment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "enable_banking_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "iban" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "is_synced" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "consent_status" text;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "last_pull_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "description_raw" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "counterparty_iban" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "is_recurring" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "status" text;--> statement-breakpoint
-- Phase-1 (D-24): seed the extensible cost-center lookup, then translate the legacy enum
-- value `shared` -> `compartilhado` on the now-text columns BEFORE the FK constraints
-- validate. These tables are empty at this point (no ingestion yet), so the UPDATEs are
-- no-ops today but keep the migration correct if ever applied to a DB that holds data.
INSERT INTO "cost_centers" ("code","label") VALUES
	('lorenzo','Lorenzo'),
	('fernanda','Fernanda'),
	('compartilhado','Compartilhado'),
	('sublocacao','Sublocacao')
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
UPDATE "accounts" SET "default_cost_center"='compartilhado' WHERE "default_cost_center"='shared';--> statement-breakpoint
UPDATE "budgets" SET "cost_center"='compartilhado' WHERE "cost_center"='shared';--> statement-breakpoint
UPDATE "rules" SET "set_cost_center"='compartilhado' WHERE "set_cost_center"='shared';--> statement-breakpoint
UPDATE "transactions" SET "cost_center"='compartilhado' WHERE "cost_center"='shared';--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_default_cost_center_cost_centers_code_fk" FOREIGN KEY ("default_cost_center") REFERENCES "public"."cost_centers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_cost_center_cost_centers_code_fk" FOREIGN KEY ("cost_center") REFERENCES "public"."cost_centers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_set_cost_center_cost_centers_code_fk" FOREIGN KEY ("set_cost_center") REFERENCES "public"."cost_centers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_cost_center_cost_centers_code_fk" FOREIGN KEY ("cost_center") REFERENCES "public"."cost_centers"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_enable_banking_id_unique" UNIQUE("enable_banking_id");--> statement-breakpoint
DROP TYPE "public"."cost_center";