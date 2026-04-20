CREATE TABLE "rank_match_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"placement" smallint,
	"win" boolean NOT NULL,
	"performance_score" double precision,
	"mmr_before" double precision NOT NULL,
	"mmr_after" double precision NOT NULL,
	"rank_score_before" integer NOT NULL,
	"rank_score_after" integer NOT NULL,
	"tier_before_id" uuid,
	"tier_after_id" uuid,
	"subtier_before" smallint NOT NULL,
	"subtier_after" smallint NOT NULL,
	"stars_before" smallint NOT NULL,
	"stars_after" smallint NOT NULL,
	"stars_delta" smallint NOT NULL,
	"promoted" boolean DEFAULT false NOT NULL,
	"demoted" boolean DEFAULT false NOT NULL,
	"protection_applied" jsonb
);
--> statement-breakpoint
CREATE TABLE "rank_matches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"season_id" uuid NOT NULL,
	"external_match_id" text NOT NULL,
	"game_mode" text,
	"total_participants" smallint NOT NULL,
	"team_count" smallint NOT NULL,
	"settled_at" timestamp DEFAULT now() NOT NULL,
	"raw_payload" jsonb,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "rank_player_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tier_id" uuid,
	"subtier" smallint DEFAULT 0 NOT NULL,
	"stars" smallint DEFAULT 0 NOT NULL,
	"rank_score" integer DEFAULT 0 NOT NULL,
	"mmr" double precision DEFAULT 1000 NOT NULL,
	"mmr_deviation" double precision DEFAULT 350 NOT NULL,
	"mmr_volatility" double precision DEFAULT 0.06 NOT NULL,
	"win_streak" smallint DEFAULT 0 NOT NULL,
	"loss_streak" smallint DEFAULT 0 NOT NULL,
	"protection_uses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"last_match_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_season_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"final_tier_id" uuid,
	"final_subtier" smallint NOT NULL,
	"final_stars" smallint NOT NULL,
	"final_rank_score" integer NOT NULL,
	"final_mmr" double precision NOT NULL,
	"final_global_rank" integer,
	"settled_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_seasons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"tier_config_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"inheritance_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_tier_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"rating_params" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_tiers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tier_config_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"min_rank_score" integer NOT NULL,
	"max_rank_score" integer,
	"subtier_count" smallint DEFAULT 1 NOT NULL,
	"stars_per_subtier" smallint DEFAULT 5 NOT NULL,
	"protection_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb
);
--> statement-breakpoint
ALTER TABLE "rank_match_participants" ADD CONSTRAINT "rank_match_participants_match_id_rank_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."rank_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_matches" ADD CONSTRAINT "rank_matches_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_matches" ADD CONSTRAINT "rank_matches_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_player_states" ADD CONSTRAINT "rank_player_states_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_player_states" ADD CONSTRAINT "rank_player_states_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_player_states" ADD CONSTRAINT "rank_player_states_tier_id_rank_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."rank_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_season_snapshots" ADD CONSTRAINT "rank_season_snapshots_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_seasons" ADD CONSTRAINT "rank_seasons_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_seasons" ADD CONSTRAINT "rank_seasons_tier_config_id_rank_tier_configs_id_fk" FOREIGN KEY ("tier_config_id") REFERENCES "public"."rank_tier_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tier_configs" ADD CONSTRAINT "rank_tier_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tiers" ADD CONSTRAINT "rank_tiers_tier_config_id_rank_tier_configs_id_fk" FOREIGN KEY ("tier_config_id") REFERENCES "public"."rank_tier_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "rank_match_participants_match_user_uidx" ON "rank_match_participants" USING btree ("match_id","end_user_id");--> statement-breakpoint
CREATE INDEX "rank_match_participants_user_recent_idx" ON "rank_match_participants" USING btree ("organization_id","season_id","end_user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_matches_org_external_uidx" ON "rank_matches" USING btree ("organization_id","external_match_id");--> statement-breakpoint
CREATE INDEX "rank_matches_season_settled_idx" ON "rank_matches" USING btree ("season_id","settled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_player_states_season_user_uidx" ON "rank_player_states" USING btree ("season_id","end_user_id");--> statement-breakpoint
CREATE INDEX "rank_player_states_org_season_idx" ON "rank_player_states" USING btree ("organization_id","season_id");--> statement-breakpoint
CREATE INDEX "rank_player_states_season_score_idx" ON "rank_player_states" USING btree ("season_id","rank_score");--> statement-breakpoint
CREATE INDEX "rank_player_states_season_tier_idx" ON "rank_player_states" USING btree ("season_id","tier_id","rank_score");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_season_snapshots_uidx" ON "rank_season_snapshots" USING btree ("season_id","end_user_id");--> statement-breakpoint
CREATE INDEX "rank_season_snapshots_season_rank_idx" ON "rank_season_snapshots" USING btree ("season_id","final_global_rank");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_seasons_org_alias_uidx" ON "rank_seasons" USING btree ("organization_id","alias");--> statement-breakpoint
CREATE INDEX "rank_seasons_config_status_idx" ON "rank_seasons" USING btree ("tier_config_id","status");--> statement-breakpoint
CREATE INDEX "rank_seasons_org_status_idx" ON "rank_seasons" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "rank_seasons_window_idx" ON "rank_seasons" USING btree ("organization_id","start_at","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tier_configs_org_alias_uidx" ON "rank_tier_configs" USING btree ("organization_id","alias");--> statement-breakpoint
CREATE INDEX "rank_tier_configs_org_active_idx" ON "rank_tier_configs" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tiers_config_alias_uidx" ON "rank_tiers" USING btree ("tier_config_id","alias");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tiers_config_order_uidx" ON "rank_tiers" USING btree ("tier_config_id","order");--> statement-breakpoint
CREATE INDEX "rank_tiers_config_score_idx" ON "rank_tiers" USING btree ("tier_config_id","min_rank_score","max_rank_score");