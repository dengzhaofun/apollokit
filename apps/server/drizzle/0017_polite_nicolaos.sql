CREATE TABLE "leaderboard_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metric_key" text NOT NULL,
	"cycle" text NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"aggregation" text DEFAULT 'sum' NOT NULL,
	"max_entries" integer DEFAULT 1000 NOT NULL,
	"tie_breaker" text DEFAULT 'earliest' NOT NULL,
	"reward_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"activity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"cycle_key" text NOT NULL,
	"scope_key" text NOT NULL,
	"end_user_id" text NOT NULL,
	"score" double precision DEFAULT 0 NOT NULL,
	"tie_at" timestamp DEFAULT now() NOT NULL,
	"display_snapshot" jsonb,
	"source" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_reward_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"cycle_key" text NOT NULL,
	"scope_key" text NOT NULL,
	"end_user_id" text NOT NULL,
	"rank" integer NOT NULL,
	"rewards" jsonb NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leaderboard_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"cycle_key" text NOT NULL,
	"scope_key" text NOT NULL,
	"rankings" jsonb NOT NULL,
	"reward_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settled_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leaderboard_configs" ADD CONSTRAINT "leaderboard_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_config_id_leaderboard_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."leaderboard_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_reward_claims" ADD CONSTRAINT "leaderboard_reward_claims_config_id_leaderboard_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."leaderboard_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_config_id_leaderboard_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."leaderboard_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_configs_org_alias_uidx" ON "leaderboard_configs" USING btree ("organization_id","alias");--> statement-breakpoint
CREATE INDEX "leaderboard_configs_org_metric_status_idx" ON "leaderboard_configs" USING btree ("organization_id","metric_key","status");--> statement-breakpoint
CREATE INDEX "leaderboard_configs_activity_idx" ON "leaderboard_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_entries_uidx" ON "leaderboard_entries" USING btree ("config_id","cycle_key","scope_key","end_user_id");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_rank_idx" ON "leaderboard_entries" USING btree ("config_id","cycle_key","scope_key","score");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_reward_claims_uidx" ON "leaderboard_reward_claims" USING btree ("config_id","cycle_key","scope_key","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_snapshots_uidx" ON "leaderboard_snapshots" USING btree ("config_id","cycle_key","scope_key");--> statement-breakpoint
CREATE INDEX "leaderboard_snapshots_org_settled_idx" ON "leaderboard_snapshots" USING btree ("organization_id","settled_at");