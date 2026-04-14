CREATE TABLE "lottery_pity_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pool_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"guarantee_tier_id" uuid NOT NULL,
	"hard_pity_threshold" integer NOT NULL,
	"soft_pity_start_at" integer,
	"soft_pity_weight_increment" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_pools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cost_per_pull" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"global_pull_limit" integer,
	"global_pull_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_prizes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tier_id" uuid,
	"pool_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"reward_items" jsonb NOT NULL,
	"weight" integer DEFAULT 100 NOT NULL,
	"is_rate_up" boolean DEFAULT false NOT NULL,
	"rate_up_weight" integer DEFAULT 0 NOT NULL,
	"global_stock_limit" integer,
	"global_stock_used" integer DEFAULT 0 NOT NULL,
	"fallback_prize_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_pull_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"pool_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"batch_id" text NOT NULL,
	"batch_index" integer DEFAULT 0 NOT NULL,
	"prize_id" uuid NOT NULL,
	"tier_id" uuid,
	"tier_name" text,
	"prize_name" text NOT NULL,
	"reward_items" jsonb NOT NULL,
	"pity_triggered" boolean DEFAULT false NOT NULL,
	"pity_rule_id" uuid,
	"pity_counters_before" jsonb,
	"cost_items" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_tiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pool_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"alias" text,
	"base_weight" integer NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_user_states" (
	"pool_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"total_pull_count" integer DEFAULT 0 NOT NULL,
	"pity_counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_user_states_pk" PRIMARY KEY("pool_id","end_user_id")
);
--> statement-breakpoint
ALTER TABLE "item_definitions" ADD COLUMN "lottery_pool_id" uuid;--> statement-breakpoint
ALTER TABLE "lottery_pity_rules" ADD CONSTRAINT "lottery_pity_rules_pool_id_lottery_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_pity_rules" ADD CONSTRAINT "lottery_pity_rules_guarantee_tier_id_lottery_tiers_id_fk" FOREIGN KEY ("guarantee_tier_id") REFERENCES "public"."lottery_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_pools" ADD CONSTRAINT "lottery_pools_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_tier_id_lottery_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."lottery_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_pool_id_lottery_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_tiers" ADD CONSTRAINT "lottery_tiers_pool_id_lottery_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_user_states" ADD CONSTRAINT "lottery_user_states_pool_id_lottery_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lottery_pity_rules_pool_idx" ON "lottery_pity_rules" USING btree ("pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_pity_rules_pool_tier_uidx" ON "lottery_pity_rules" USING btree ("pool_id","guarantee_tier_id");--> statement-breakpoint
CREATE INDEX "lottery_pools_org_idx" ON "lottery_pools" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_pools_org_alias_uidx" ON "lottery_pools" USING btree ("organization_id","alias") WHERE "lottery_pools"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "lottery_prizes_tier_idx" ON "lottery_prizes" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "lottery_prizes_pool_idx" ON "lottery_prizes" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "lottery_prizes_org_idx" ON "lottery_prizes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lottery_pull_logs_org_user_idx" ON "lottery_pull_logs" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "lottery_pull_logs_pool_user_idx" ON "lottery_pull_logs" USING btree ("pool_id","end_user_id");--> statement-breakpoint
CREATE INDEX "lottery_pull_logs_batch_idx" ON "lottery_pull_logs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "lottery_pull_logs_created_idx" ON "lottery_pull_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lottery_tiers_pool_idx" ON "lottery_tiers" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "lottery_tiers_org_idx" ON "lottery_tiers" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "lottery_user_states_org_user_idx" ON "lottery_user_states" USING btree ("organization_id","end_user_id");--> statement-breakpoint
ALTER TABLE "item_definitions" ADD CONSTRAINT "item_definitions_lottery_pool_id_lottery_pools_id_fk" FOREIGN KEY ("lottery_pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE set null ON UPDATE no action;