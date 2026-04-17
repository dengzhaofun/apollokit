CREATE TABLE "storage_box_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"type" text NOT NULL,
	"lockup_days" integer,
	"interest_rate_bps" integer DEFAULT 0 NOT NULL,
	"interest_period_days" integer DEFAULT 365 NOT NULL,
	"accepted_currency_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_deposit" integer,
	"max_deposit" integer,
	"allow_early_withdraw" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_box_deposits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"box_config_id" uuid NOT NULL,
	"currency_definition_id" uuid NOT NULL,
	"principal" integer DEFAULT 0 NOT NULL,
	"accrued_interest" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"is_singleton" boolean DEFAULT false NOT NULL,
	"deposited_at" timestamp DEFAULT now() NOT NULL,
	"last_accrual_at" timestamp DEFAULT now() NOT NULL,
	"matures_at" timestamp,
	"withdrawn_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_box_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"deposit_id" uuid NOT NULL,
	"box_config_id" uuid NOT NULL,
	"currency_definition_id" uuid NOT NULL,
	"action" text NOT NULL,
	"principal_delta" integer DEFAULT 0 NOT NULL,
	"interest_delta" integer DEFAULT 0 NOT NULL,
	"principal_after" integer,
	"interest_after" integer,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_definitions" ADD COLUMN "is_currency" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Backfill: items that were implicitly modeled as currencies
--   (stackable=true, stackLimit=null, holdLimit=null) get the flag set.
UPDATE "item_definitions" SET "is_currency" = true
  WHERE "stackable" = true AND "stack_limit" IS NULL AND "hold_limit" IS NULL;--> statement-breakpoint
ALTER TABLE "storage_box_configs" ADD CONSTRAINT "storage_box_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_box_deposits" ADD CONSTRAINT "storage_box_deposits_box_config_id_storage_box_configs_id_fk" FOREIGN KEY ("box_config_id") REFERENCES "public"."storage_box_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_box_deposits" ADD CONSTRAINT "storage_box_deposits_currency_definition_id_item_definitions_id_fk" FOREIGN KEY ("currency_definition_id") REFERENCES "public"."item_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_box_configs_org_idx" ON "storage_box_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_box_configs_org_alias_uidx" ON "storage_box_configs" USING btree ("organization_id","alias") WHERE "storage_box_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "storage_box_deposits_org_user_idx" ON "storage_box_deposits" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "storage_box_deposits_box_idx" ON "storage_box_deposits" USING btree ("box_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_box_deposits_demand_uidx" ON "storage_box_deposits" USING btree ("organization_id","end_user_id","box_config_id","currency_definition_id") WHERE "storage_box_deposits"."is_singleton" = true AND "storage_box_deposits"."status" = 'active';--> statement-breakpoint
CREATE INDEX "storage_box_logs_org_user_idx" ON "storage_box_logs" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "storage_box_logs_deposit_idx" ON "storage_box_logs" USING btree ("deposit_id");