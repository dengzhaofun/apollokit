CREATE TABLE "battle_pass_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"level" integer NOT NULL,
	"tier_code" text NOT NULL,
	"reward_entries" jsonb NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"activity_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"max_level" integer NOT NULL,
	"level_curve" jsonb NOT NULL,
	"tiers" jsonb NOT NULL,
	"level_rewards" jsonb NOT NULL,
	"bonus_milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allow_level_purchase" boolean DEFAULT false NOT NULL,
	"level_purchase_price_sku" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_season_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"task_definition_id" uuid NOT NULL,
	"xp_reward" integer NOT NULL,
	"category" text NOT NULL,
	"week_index" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_tier_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"tier_code" text NOT NULL,
	"source" text NOT NULL,
	"external_order_id" text,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_user_progress" (
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"current_xp" integer DEFAULT 0 NOT NULL,
	"current_level" integer DEFAULT 0 NOT NULL,
	"owned_tiers" text[] DEFAULT ARRAY['free']::text[] NOT NULL,
	"last_xp_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "battle_pass_user_progress_pk" PRIMARY KEY("season_id","end_user_id")
);
--> statement-breakpoint
ALTER TABLE "battle_pass_claims" ADD CONSTRAINT "battle_pass_claims_season_id_battle_pass_configs_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."battle_pass_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_configs" ADD CONSTRAINT "battle_pass_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_season_tasks" ADD CONSTRAINT "battle_pass_season_tasks_season_id_battle_pass_configs_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."battle_pass_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_tier_grants" ADD CONSTRAINT "battle_pass_tier_grants_season_id_battle_pass_configs_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."battle_pass_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_user_progress" ADD CONSTRAINT "battle_pass_user_progress_season_id_battle_pass_configs_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."battle_pass_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_claims_user_level_tier_uidx" ON "battle_pass_claims" USING btree ("season_id","end_user_id","level","tier_code");--> statement-breakpoint
CREATE INDEX "battle_pass_claims_season_idx" ON "battle_pass_claims" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "battle_pass_claims_org_user_idx" ON "battle_pass_claims" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "battle_pass_configs_organization_id_idx" ON "battle_pass_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "battle_pass_configs_activity_idx" ON "battle_pass_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_configs_org_code_uidx" ON "battle_pass_configs" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_configs_activity_uidx" ON "battle_pass_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "battle_pass_season_tasks_season_idx" ON "battle_pass_season_tasks" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "battle_pass_season_tasks_task_idx" ON "battle_pass_season_tasks" USING btree ("task_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_season_tasks_season_task_uidx" ON "battle_pass_season_tasks" USING btree ("season_id","task_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_tier_grants_user_tier_uidx" ON "battle_pass_tier_grants" USING btree ("season_id","end_user_id","tier_code");--> statement-breakpoint
CREATE INDEX "battle_pass_tier_grants_season_idx" ON "battle_pass_tier_grants" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "battle_pass_tier_grants_org_user_idx" ON "battle_pass_tier_grants" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "battle_pass_user_progress_org_user_idx" ON "battle_pass_user_progress" USING btree ("organization_id","end_user_id");