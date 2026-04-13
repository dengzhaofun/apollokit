CREATE TABLE "check_in_rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"reward_items" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cost_items" jsonb NOT NULL,
	"reward_items" jsonb NOT NULL,
	"user_limit" integer,
	"global_limit" integer,
	"global_count" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_user_states" (
	"option_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_user_states_pk" PRIMARY KEY("option_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category_id" uuid,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"stackable" boolean DEFAULT true NOT NULL,
	"stack_limit" integer,
	"hold_limit" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_grant_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"definition_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"quantity_before" integer,
	"quantity_after" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_inventories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"definition_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"instance_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_in_user_states" DROP CONSTRAINT "check_in_user_states_config_id_check_in_configs_id_fk";--> statement-breakpoint
ALTER TABLE "check_in_configs" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "check_in_user_states" ALTER COLUMN "config_id" SET DATA TYPE uuid USING "config_id"::uuid;--> statement-breakpoint
ALTER TABLE "check_in_user_states" ADD CONSTRAINT "check_in_user_states_config_id_check_in_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_in_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credentials" ALTER COLUMN "id" SET DATA TYPE uuid USING "id"::uuid;--> statement-breakpoint
ALTER TABLE "check_in_rewards" ADD CONSTRAINT "check_in_rewards_config_id_check_in_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_in_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_configs" ADD CONSTRAINT "exchange_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_options" ADD CONSTRAINT "exchange_options_config_id_exchange_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."exchange_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_user_states" ADD CONSTRAINT "exchange_user_states_option_id_exchange_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."exchange_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_definitions" ADD CONSTRAINT "item_definitions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_definitions" ADD CONSTRAINT "item_definitions_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_inventories" ADD CONSTRAINT "item_inventories_definition_id_item_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."item_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_rewards_config_day_uidx" ON "check_in_rewards" USING btree ("config_id","day_number");--> statement-breakpoint
CREATE INDEX "check_in_rewards_config_idx" ON "check_in_rewards" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "exchange_configs_org_idx" ON "exchange_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_configs_org_alias_uidx" ON "exchange_configs" USING btree ("organization_id","alias") WHERE "exchange_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "exchange_options_config_idx" ON "exchange_options" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "exchange_options_org_idx" ON "exchange_options" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "item_categories_org_idx" ON "item_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_org_alias_uidx" ON "item_categories" USING btree ("organization_id","alias") WHERE "item_categories"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "item_definitions_org_idx" ON "item_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "item_definitions_category_idx" ON "item_definitions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_definitions_org_alias_uidx" ON "item_definitions" USING btree ("organization_id","alias") WHERE "item_definitions"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "item_grant_logs_org_user_idx" ON "item_grant_logs" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "item_grant_logs_source_idx" ON "item_grant_logs" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "item_inventories_user_def_idx" ON "item_inventories" USING btree ("organization_id","end_user_id","definition_id");--> statement-breakpoint
CREATE INDEX "item_inventories_org_user_idx" ON "item_inventories" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_inventories_singleton_uidx" ON "item_inventories" USING btree ("organization_id","end_user_id","definition_id") WHERE "item_inventories"."instance_data" IS NULL;