CREATE TABLE "friend_blocks" (
	"organization_id" text NOT NULL,
	"blocker_user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_blocks_pk" PRIMARY KEY("organization_id","blocker_user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "friend_relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"message" text,
	"responded_at" timestamp,
	"expires_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"max_friends" integer DEFAULT 50 NOT NULL,
	"max_blocked" integer DEFAULT 50 NOT NULL,
	"max_pending_requests" integer DEFAULT 20 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_contribution_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"guild_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"guild_exp_delta" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_guilds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"announcement" text,
	"leader_user_id" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"experience" integer DEFAULT 0 NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"max_members" integer DEFAULT 50 NOT NULL,
	"join_mode" text DEFAULT 'request' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"disbanded_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_join_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"guild_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" text,
	"message" text,
	"responded_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guild_members" (
	"guild_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"contribution" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "guild_members_pk" PRIMARY KEY("guild_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "guild_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"max_members" integer DEFAULT 50 NOT NULL,
	"max_officers" integer DEFAULT 5 NOT NULL,
	"create_cost" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"level_up_rules" jsonb,
	"join_mode" text DEFAULT 'request' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"max_members" integer DEFAULT 4 NOT NULL,
	"auto_dissolve_on_leader_leave" boolean DEFAULT false NOT NULL,
	"allow_quick_match" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" uuid NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_members_pk" PRIMARY KEY("team_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "team_teams" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"config_id" uuid NOT NULL,
	"leader_user_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"dissolved_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_gift_daily_states" (
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"date_key" text NOT NULL,
	"send_count" integer DEFAULT 0 NOT NULL,
	"receive_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_gift_daily_states_pk" PRIMARY KEY("organization_id","end_user_id","date_key")
);
--> statement-breakpoint
CREATE TABLE "friend_gift_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"gift_items" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_gift_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"package_id" uuid,
	"sender_user_id" text NOT NULL,
	"receiver_user_id" text NOT NULL,
	"gift_items" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"claimed_at" timestamp,
	"expires_at" timestamp,
	"message" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_gift_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"daily_send_limit" integer DEFAULT 5 NOT NULL,
	"daily_receive_limit" integer DEFAULT 10 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "friend_settings" ADD CONSTRAINT "friend_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_contribution_logs" ADD CONSTRAINT "guild_contribution_logs_guild_id_guild_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_join_requests" ADD CONSTRAINT "guild_join_requests_guild_id_guild_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_guild_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_configs" ADD CONSTRAINT "team_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_team_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_team_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team_teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_teams" ADD CONSTRAINT "team_teams_config_id_team_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."team_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_gift_sends" ADD CONSTRAINT "friend_gift_sends_package_id_friend_gift_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."friend_gift_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_gift_settings" ADD CONSTRAINT "friend_gift_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "friend_blocks_org_blocker_idx" ON "friend_blocks" USING btree ("organization_id","blocker_user_id");--> statement-breakpoint
CREATE INDEX "friend_blocks_org_blocked_idx" ON "friend_blocks" USING btree ("organization_id","blocked_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_relationships_org_pair_uidx" ON "friend_relationships" USING btree ("organization_id","user_a","user_b");--> statement-breakpoint
CREATE INDEX "friend_relationships_org_user_a_idx" ON "friend_relationships" USING btree ("organization_id","user_a");--> statement-breakpoint
CREATE INDEX "friend_relationships_org_user_b_idx" ON "friend_relationships" USING btree ("organization_id","user_b");--> statement-breakpoint
CREATE INDEX "friend_requests_org_to_status_idx" ON "friend_requests" USING btree ("organization_id","to_user_id","status");--> statement-breakpoint
CREATE INDEX "friend_requests_org_from_status_idx" ON "friend_requests" USING btree ("organization_id","from_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pending_pair_uidx" ON "friend_requests" USING btree ("organization_id","from_user_id","to_user_id") WHERE "friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "friend_settings_org_uidx" ON "friend_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "guild_contribution_logs_guild_user_idx" ON "guild_contribution_logs" USING btree ("guild_id","end_user_id");--> statement-breakpoint
CREATE INDEX "guild_contribution_logs_source_idx" ON "guild_contribution_logs" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "guild_guilds_org_idx" ON "guild_guilds" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "guild_guilds_org_leader_idx" ON "guild_guilds" USING btree ("organization_id","leader_user_id");--> statement-breakpoint
CREATE INDEX "guild_guilds_org_name_idx" ON "guild_guilds" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "guild_join_requests_guild_status_idx" ON "guild_join_requests" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "guild_join_requests_org_user_status_idx" ON "guild_join_requests" USING btree ("organization_id","end_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_join_requests_pending_uidx" ON "guild_join_requests" USING btree ("guild_id","end_user_id","type") WHERE "guild_join_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "guild_members_org_user_idx" ON "guild_members" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_settings_org_uidx" ON "guild_settings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "team_configs_org_idx" ON "team_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_configs_org_alias_uidx" ON "team_configs" USING btree ("organization_id","alias") WHERE "team_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "team_invitations_team_status_idx" ON "team_invitations" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "team_invitations_org_to_status_idx" ON "team_invitations" USING btree ("organization_id","to_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invitations_pending_uidx" ON "team_invitations" USING btree ("team_id","to_user_id") WHERE "team_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "team_members_org_user_idx" ON "team_members" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "team_teams_org_config_status_idx" ON "team_teams" USING btree ("organization_id","config_id","status");--> statement-breakpoint
CREATE INDEX "team_teams_org_leader_idx" ON "team_teams" USING btree ("organization_id","config_id","leader_user_id");--> statement-breakpoint
CREATE INDEX "friend_gift_packages_org_idx" ON "friend_gift_packages" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_gift_packages_org_alias_uidx" ON "friend_gift_packages" USING btree ("organization_id","alias") WHERE "friend_gift_packages"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "friend_gift_sends_org_sender_idx" ON "friend_gift_sends" USING btree ("organization_id","sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "friend_gift_sends_org_receiver_status_idx" ON "friend_gift_sends" USING btree ("organization_id","receiver_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_gift_settings_org_uidx" ON "friend_gift_settings" USING btree ("organization_id");