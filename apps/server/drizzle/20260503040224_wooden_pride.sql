CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"cover_image_url" text,
	"cta_url" text,
	"cta_label" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"visible_from" timestamp,
	"visible_until" timestamp,
	"platforms" text[],
	"locales" text[],
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"config_id" text DEFAULT 'default' NOT NULL,
	"name" text,
	"start" text,
	"reference_id" text NOT NULL,
	"prefix" text,
	"key" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"enabled" boolean DEFAULT true,
	"rate_limit_enabled" boolean DEFAULT true,
	"rate_limit_time_window" integer DEFAULT 86400000,
	"rate_limit_max" integer DEFAULT 10,
	"request_count" integer DEFAULT 0,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"team_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "organization_role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"role" text NOT NULL,
	"permission" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	"active_team_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"normalized_email" text,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_normalized_email_unique" UNIQUE("normalized_email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "badge_dismissals" (
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"node_key" text NOT NULL,
	"dismissed_version" text,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	"period_key" text,
	"session_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "badge_dismissals_pk" PRIMARY KEY("tenant_id","end_user_id","node_key")
);
--> statement-breakpoint
CREATE TABLE "badge_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"key" text NOT NULL,
	"parent_key" text,
	"display_type" text NOT NULL,
	"display_label_key" text,
	"signal_match_mode" text NOT NULL,
	"signal_key" text,
	"signal_key_prefix" text,
	"aggregation" text DEFAULT 'none' NOT NULL,
	"dismiss_mode" text DEFAULT 'auto' NOT NULL,
	"dismiss_config" jsonb,
	"visibility_rule" jsonb,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "badge_signal_registry" (
	"tenant_id" text NOT NULL,
	"key_pattern" text NOT NULL,
	"is_dynamic" boolean DEFAULT false NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"example_meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "badge_signal_registry_pk" PRIMARY KEY("tenant_id","key_pattern")
);
--> statement-breakpoint
CREATE TABLE "badge_signals" (
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"signal_key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"version" text,
	"first_appeared_at" timestamp,
	"expires_at" timestamp,
	"meta" jsonb,
	"tooltip_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "badge_signals_pk" PRIMARY KEY("tenant_id","end_user_id","signal_key")
);
--> statement-breakpoint
CREATE TABLE "banner_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"layout" text DEFAULT 'carousel' NOT NULL,
	"interval_ms" integer DEFAULT 4000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"image_url_mobile" text NOT NULL,
	"image_url_desktop" text NOT NULL,
	"alt_text" text,
	"link_action" jsonb NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"visible_from" timestamp,
	"visible_until" timestamp,
	"target_type" text DEFAULT 'broadcast' NOT NULL,
	"target_user_ids" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_claims" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"level" integer NOT NULL,
	"tier_code" text NOT NULL,
	"reward_entries" jsonb NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
	"task_definition_id" uuid NOT NULL,
	"xp_reward" integer NOT NULL,
	"category" text NOT NULL,
	"week_index" integer,
	"sort_order" text COLLATE "C" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_tier_grants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"tier_code" text NOT NULL,
	"source" text NOT NULL,
	"external_order_id" text,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "battle_pass_user_progress" (
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"current_xp" integer DEFAULT 0 NOT NULL,
	"current_level" integer DEFAULT 0 NOT NULL,
	"owned_tiers" text[] DEFAULT ARRAY['free']::text[] NOT NULL,
	"last_xp_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "battle_pass_user_progress_pk" PRIMARY KEY("season_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "cdkey_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"code_type" text NOT NULL,
	"reward" jsonb NOT NULL,
	"total_limit" integer,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"total_redeemed" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdkey_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text NOT NULL,
	"redeemed_by" text,
	"redeemed_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdkey_redemption_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"code_id" uuid,
	"code" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text NOT NULL,
	"fail_reason" text,
	"reward" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdkey_user_states" (
	"batch_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cdkey_user_states_pk" PRIMARY KEY("batch_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "character_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"avatar_url" text,
	"portrait_url" text,
	"default_side" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"reset_mode" text NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"target" integer,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in_rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"reward_items" jsonb NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in_user_states" (
	"config_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"total_days" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"current_cycle_key" text,
	"current_cycle_days" integer DEFAULT 0 NOT NULL,
	"last_check_in_date" date,
	"first_check_in_at" timestamp,
	"last_check_in_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "check_in_user_states_pk" PRIMARY KEY("config_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "offline_check_in_campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"banner_image" text,
	"mode" text NOT NULL,
	"completion_rule" jsonb NOT NULL,
	"completion_rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"collection_album_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_check_in_grants" (
	"campaign_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"reward_key" text NOT NULL,
	"tenant_id" text NOT NULL,
	"reward_items" jsonb NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offline_check_in_grants_pk" PRIMARY KEY("campaign_id","end_user_id","reward_key")
);
--> statement-breakpoint
CREATE TABLE "offline_check_in_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"spot_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"accepted" boolean NOT NULL,
	"reject_reason" text,
	"verified_via" jsonb NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"accuracy_m" double precision,
	"distance_m" double precision,
	"media_asset_id" uuid,
	"device_fingerprint" text,
	"ip" text,
	"country" text,
	"user_agent" text,
	"nonce" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_check_in_spots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"geofence_radius_m" integer DEFAULT 100 NOT NULL,
	"verification" jsonb NOT NULL,
	"spot_rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"collection_entry_aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offline_check_in_user_progress" (
	"campaign_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"spots_completed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"last_spot_id" uuid,
	"last_check_in_at" timestamp,
	"daily_count" integer DEFAULT 0 NOT NULL,
	"daily_dates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offline_check_in_user_progress_pk" PRIMARY KEY("campaign_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "experiment_assignments" (
	"experiment_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"variant_id" uuid NOT NULL,
	"variant_key" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "experiment_assignments_pk" PRIMARY KEY("experiment_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "experiment_variants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"experiment_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"variant_key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_control" boolean DEFAULT false NOT NULL,
	"config_json" jsonb,
	"sort_order" text COLLATE "C" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experiment_experiments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"traffic_allocation" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"control_variant_key" text NOT NULL,
	"targeting_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"primary_metric" jsonb,
	"metric_window_days" integer DEFAULT 7 NOT NULL,
	"started_at" timestamp,
	"ended_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"publishable_key" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"dev_mode" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"type_id" uuid NOT NULL,
	"type_alias" text NOT NULL,
	"alias" text NOT NULL,
	"group_key" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"schema_version" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"schema" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"group_options" text[],
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eu_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eu_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	CONSTRAINT "eu_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "eu_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"tenant_id" text NOT NULL,
	"external_id" text,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "eu_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "eu_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_albums" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"icon" text,
	"scope" text DEFAULT 'custom' NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"album_id" uuid NOT NULL,
	"group_id" uuid,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"rarity" text,
	"sort_order" text COLLATE "C" NOT NULL,
	"hidden_until_unlocked" boolean DEFAULT false NOT NULL,
	"trigger_type" text DEFAULT 'item' NOT NULL,
	"trigger_item_definition_id" uuid,
	"trigger_quantity" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"album_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" text COLLATE "C" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_milestones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"album_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"group_id" uuid,
	"entry_id" uuid,
	"threshold" integer DEFAULT 1 NOT NULL,
	"label" text,
	"reward_items" jsonb NOT NULL,
	"auto_claim" boolean DEFAULT false NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_user_entries" (
	"entry_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"album_id" uuid NOT NULL,
	"unlocked_at" timestamp DEFAULT now() NOT NULL,
	"source" text,
	"source_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collection_user_entries_pk" PRIMARY KEY("entry_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "collection_user_milestones" (
	"milestone_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"album_id" uuid NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"delivery_mode" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collection_user_milestones_pk" PRIMARY KEY("milestone_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "currencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"currency_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"balance_before" integer,
	"balance_after" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "currency_wallets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"currency_id" uuid NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dialogue_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"script_id" uuid NOT NULL,
	"current_node_id" text,
	"history_path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dialogue_scripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"start_node_id" text NOT NULL,
	"nodes" jsonb NOT NULL,
	"trigger_condition" jsonb,
	"repeatable" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"cost_items" jsonb NOT NULL,
	"reward_items" jsonb NOT NULL,
	"user_limit" integer,
	"global_limit" integer,
	"global_count" integer DEFAULT 0 NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_user_states" (
	"option_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_user_states_pk" PRIMARY KEY("option_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "item_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"icon" text,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"category_id" uuid,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"stackable" boolean DEFAULT true NOT NULL,
	"stack_limit" integer,
	"hold_limit" integer,
	"lottery_pool_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_grant_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"definition_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"quantity_before" integer,
	"quantity_after" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_inventories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"definition_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"is_singleton" boolean DEFAULT false NOT NULL,
	"instance_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"code" text NOT NULL,
	"rotated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"inviter_end_user_id" text NOT NULL,
	"invitee_end_user_id" text NOT NULL,
	"inviter_code_snapshot" text NOT NULL,
	"bound_at" timestamp DEFAULT now() NOT NULL,
	"qualified_at" timestamp,
	"qualified_reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_settings" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"code_length" integer DEFAULT 8 NOT NULL,
	"allow_self_invite" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_settings_code_length_check" CHECK ("invite_settings"."code_length" >= 4 AND "invite_settings"."code_length" <= 24 AND "invite_settings"."code_length" % 4 = 0)
);
--> statement-breakpoint
CREATE TABLE "lottery_pity_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"pool_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cost_per_pull" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_at" timestamp,
	"end_at" timestamp,
	"global_pull_limit" integer,
	"global_pull_count" integer DEFAULT 0 NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_prizes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tier_id" uuid,
	"pool_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
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
	"sort_order" text COLLATE "C" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_pull_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"alias" text,
	"base_weight" integer NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lottery_user_states" (
	"pool_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"total_pull_count" integer DEFAULT 0 NOT NULL,
	"pity_counters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lottery_user_states_pk" PRIMARY KEY("pool_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "mail_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"rewards" jsonb NOT NULL,
	"target_type" text NOT NULL,
	"target_user_ids" jsonb,
	"require_read" boolean DEFAULT false NOT NULL,
	"sender_admin_id" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"origin_source" text,
	"origin_source_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_user_states" (
	"message_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"read_at" timestamp,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail_user_states_pk" PRIMARY KEY("message_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "navigation_favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"route_path" text NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"parent_id" uuid,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"icon" text,
	"level" integer DEFAULT 0 NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_growth_stage_claims" (
	"stage_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "shop_growth_stage_claims_pk" PRIMARY KEY("stage_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "shop_growth_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"stage_index" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"trigger_type" text NOT NULL,
	"trigger_config" jsonb,
	"reward_items" jsonb NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_product_tags" (
	"product_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_product_tags_pk" PRIMARY KEY("product_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "shop_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"category_id" uuid,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"gallery_images" jsonb,
	"product_type" text DEFAULT 'regular' NOT NULL,
	"cost_items" jsonb NOT NULL,
	"reward_items" jsonb NOT NULL,
	"time_window_type" text DEFAULT 'none' NOT NULL,
	"available_from" timestamp,
	"available_to" timestamp,
	"eligibility_anchor" text,
	"eligibility_window_seconds" integer,
	"refresh_cycle" text,
	"refresh_limit" integer,
	"user_limit" integer,
	"global_limit" integer,
	"global_count" integer DEFAULT 0 NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"color" text,
	"icon" text,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_user_purchase_states" (
	"product_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"cycle_count" integer DEFAULT 0 NOT NULL,
	"cycle_reset_at" timestamp,
	"first_purchase_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_user_purchase_states_pk" PRIMARY KEY("product_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "friend_blocks" (
	"tenant_id" text NOT NULL,
	"blocker_user_id" text NOT NULL,
	"blocked_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_blocks_pk" PRIMARY KEY("tenant_id","blocker_user_id","blocked_user_id")
);
--> statement-breakpoint
CREATE TABLE "friend_relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_requests" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
CREATE TABLE "match_squad_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
CREATE TABLE "match_squad_invitations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"squad_id" uuid NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_squad_members" (
	"squad_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "match_squad_members_pk" PRIMARY KEY("squad_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "match_squads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"date_key" text NOT NULL,
	"send_count" integer DEFAULT 0 NOT NULL,
	"receive_count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "friend_gift_daily_states_pk" PRIMARY KEY("tenant_id","end_user_id","date_key")
);
--> statement-breakpoint
CREATE TABLE "friend_gift_packages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"gift_items" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "friend_gift_sends" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
	"daily_send_limit" integer DEFAULT 5 NOT NULL,
	"daily_receive_limit" integer DEFAULT 10 NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_action_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_blueprint_skins" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"rarity" text,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stat_bonuses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_blueprints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"schema_id" uuid NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"rarity" text,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"assets" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"stat_growth" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"level_up_costs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rank_up_costs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synthesis_cost" jsonb,
	"max_level" integer,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_formation_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"max_formations" integer DEFAULT 5 NOT NULL,
	"max_slots" integer DEFAULT 4 NOT NULL,
	"accepts_schema_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"allow_duplicate_blueprints" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_formations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"config_id" uuid NOT NULL,
	"formation_index" integer NOT NULL,
	"name" text,
	"slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"blueprint_id" uuid NOT NULL,
	"schema_id" uuid NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"exp" integer DEFAULT 0 NOT NULL,
	"rank_key" text,
	"skin_id" uuid,
	"computed_stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"custom_data" jsonb,
	"is_locked" boolean DEFAULT false NOT NULL,
	"acquired_at" timestamp DEFAULT now() NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_schemas" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"stat_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tag_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"slot_definitions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"level_config" jsonb DEFAULT '{"enabled":false,"maxLevel":1}'::jsonb NOT NULL,
	"rank_config" jsonb DEFAULT '{"enabled":false,"ranks":[]}'::jsonb NOT NULL,
	"synthesis_config" jsonb DEFAULT '{"enabled":false,"sameBlueprint":true,"inputCount":2}'::jsonb NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_slot_assignments" (
	"owner_instance_id" uuid NOT NULL,
	"slot_key" text NOT NULL,
	"slot_index" integer DEFAULT 0 NOT NULL,
	"equipped_instance_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "entity_slot_assignments_pk" PRIMARY KEY("owner_instance_id","slot_key","slot_index")
);
--> statement-breakpoint
CREATE TABLE "level_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"icon" text,
	"has_stages" boolean DEFAULT false NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"unlock_rule" jsonb,
	"sort_order" text COLLATE "C" NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_user_progress" (
	"level_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"config_id" uuid NOT NULL,
	"status" text DEFAULT 'unlocked' NOT NULL,
	"stars" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"best_score" integer,
	"cleared_at" timestamp,
	"rewards_claimed" boolean DEFAULT false NOT NULL,
	"star_rewards_claimed" integer DEFAULT 0 NOT NULL,
	"source" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "level_user_progress_pk" PRIMARY KEY("level_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"stage_id" uuid,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"difficulty" text,
	"max_stars" integer DEFAULT 3 NOT NULL,
	"unlock_rule" jsonb,
	"clear_rewards" jsonb,
	"star_rewards" jsonb,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"scope" text DEFAULT 'task' NOT NULL,
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"category_id" uuid,
	"parent_id" uuid,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"period" text NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"counting_method" text NOT NULL,
	"event_name" text,
	"event_value_field" text,
	"filter" text,
	"target_value" integer NOT NULL,
	"parent_progress_value" integer DEFAULT 1 NOT NULL,
	"prerequisite_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rewards" jsonb NOT NULL,
	"reward_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_claim" boolean DEFAULT false NOT NULL,
	"navigation" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'broadcast' NOT NULL,
	"default_assignment_ttl_seconds" integer,
	"sort_order" text COLLATE "C" NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_user_assignments" (
	"task_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"source" text NOT NULL,
	"source_ref" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_user_assignments_pk" PRIMARY KEY("task_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "task_user_milestone_claims" (
	"task_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"period_key" text NOT NULL,
	"tier_alias" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_user_milestone_claims_pk" PRIMARY KEY("task_id","end_user_id","period_key","tier_alias")
);
--> statement-breakpoint
CREATE TABLE "task_user_progress" (
	"task_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"period_key" text NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_user_progress_pk" PRIMARY KEY("task_id","end_user_id")
);
--> statement-breakpoint
CREATE TABLE "leaderboard_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
	"cycle_key" text NOT NULL,
	"scope_key" text NOT NULL,
	"rankings" jsonb NOT NULL,
	"reward_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"settled_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"banner_image" text,
	"theme_color" text,
	"kind" text DEFAULT 'generic' NOT NULL,
	"visible_at" timestamp NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"hidden_at" timestamp NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"global_rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cleanup_rule" jsonb DEFAULT '{"mode":"purge"}'::jsonb NOT NULL,
	"join_requirement" jsonb,
	"membership" jsonb DEFAULT 'null'::jsonb,
	"visibility" text DEFAULT 'public' NOT NULL,
	"template_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_members" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"activity_points" bigint DEFAULT 0 NOT NULL,
	"node_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'joined' NOT NULL,
	"completed_at" timestamp,
	"left_at" timestamp,
	"queue_number" text,
	"queue_number_used_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text NOT NULL,
	"node_type" text NOT NULL,
	"ref_id" uuid,
	"order_index" integer DEFAULT 0 NOT NULL,
	"unlock_rule" jsonb DEFAULT 'null'::jsonb,
	"node_config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_point_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"delta" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text NOT NULL,
	"trigger_kind" text NOT NULL,
	"cron_expr" text,
	"fire_at" timestamp,
	"offset_from" text,
	"offset_seconds" integer,
	"action_type" text NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_fired_at" timestamp,
	"last_status" text,
	"next_fire_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_payload" jsonb NOT NULL,
	"duration_spec" jsonb NOT NULL,
	"recurrence" jsonb NOT NULL,
	"alias_pattern" text NOT NULL,
	"nodes_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"schedules_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"currencies_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"item_definitions_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"entity_blueprints_blueprint" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"auto_publish" boolean DEFAULT false NOT NULL,
	"next_instance_at" timestamp,
	"last_instantiated_alias" text,
	"last_instantiated_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_user_rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"reward_key" text NOT NULL,
	"rewards" jsonb NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_pool_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"mode" text DEFAULT 'decrement' NOT NULL,
	"target_amount" bigint NOT NULL,
	"contribution_policy" jsonb NOT NULL,
	"per_assister_limit" integer DEFAULT 1 NOT NULL,
	"initiator_can_assist" boolean DEFAULT false NOT NULL,
	"expires_in_seconds" integer DEFAULT 86400 NOT NULL,
	"max_instances_per_initiator" integer,
	"rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_pool_contributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"assister_end_user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"remaining_after" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_pool_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"config_id" uuid NOT NULL,
	"initiator_end_user_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"remaining" bigint NOT NULL,
	"target_amount" bigint NOT NULL,
	"contribution_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"reward_granted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_pool_rewards_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"initiator_end_user_id" text NOT NULL,
	"rewards" jsonb NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"actor_label" text,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"resource_label" text,
	"action" text NOT NULL,
	"method" text NOT NULL,
	"path" text NOT NULL,
	"status" integer NOT NULL,
	"trace_id" text,
	"ip" text,
	"user_agent" text,
	"before" jsonb,
	"after" jsonb,
	"metadata" jsonb,
	"version" smallint DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_box_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"sort_order" text COLLATE "C" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_box_deposits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"folder_id" uuid NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" bigint NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" text,
	"uploaded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_folders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_catalog_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"event_name" text NOT NULL,
	"status" text DEFAULT 'inferred' NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_event_data" jsonb,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_match_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"match_id" uuid NOT NULL,
	"tenant_id" text NOT NULL,
	"season_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"match_team_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
	"tenant_id" text NOT NULL,
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
CREATE TABLE "webhooks_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"endpoint_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now(),
	"last_status_code" integer,
	"last_error" text,
	"last_attempted_at" timestamp,
	"succeeded_at" timestamp,
	"failed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"event_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"secret_ciphertext" text NOT NULL,
	"secret_hint" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp,
	"last_failure_at" timestamp,
	"disabled_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"rule_id" uuid NOT NULL,
	"rule_version" integer NOT NULL,
	"event_name" text NOT NULL,
	"end_user_id" text,
	"trace_id" text,
	"condition_result" text,
	"action_results" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"trigger_event" text NOT NULL,
	"condition" jsonb,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"throttle" jsonb,
	"graph" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"source" text,
	"source_ref" text,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_role" ADD CONSTRAINT "organization_role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_nodes" ADD CONSTRAINT "badge_nodes_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_signal_registry" ADD CONSTRAINT "badge_signal_registry_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banner_groups" ADD CONSTRAINT "banner_groups_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_group_id_banner_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."banner_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_claims" ADD CONSTRAINT "battle_pass_claims_season_id_battle_pass_configs_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."battle_pass_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_configs" ADD CONSTRAINT "battle_pass_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_season_tasks" ADD CONSTRAINT "battle_pass_season_tasks_season_id_battle_pass_configs_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."battle_pass_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_tier_grants" ADD CONSTRAINT "battle_pass_tier_grants_season_id_battle_pass_configs_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."battle_pass_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "battle_pass_user_progress" ADD CONSTRAINT "battle_pass_user_progress_season_id_battle_pass_configs_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."battle_pass_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdkey_batches" ADD CONSTRAINT "cdkey_batches_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdkey_codes" ADD CONSTRAINT "cdkey_codes_batch_id_cdkey_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."cdkey_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdkey_user_states" ADD CONSTRAINT "cdkey_user_states_batch_id_cdkey_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."cdkey_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_definitions" ADD CONSTRAINT "character_definitions_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_configs" ADD CONSTRAINT "check_in_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_rewards" ADD CONSTRAINT "check_in_rewards_config_id_check_in_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_in_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_user_states" ADD CONSTRAINT "check_in_user_states_config_id_check_in_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_in_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_campaigns" ADD CONSTRAINT "offline_check_in_campaigns_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_campaigns" ADD CONSTRAINT "offline_check_in_campaigns_collection_album_id_collection_albums_id_fk" FOREIGN KEY ("collection_album_id") REFERENCES "public"."collection_albums"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_grants" ADD CONSTRAINT "offline_check_in_grants_campaign_id_offline_check_in_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offline_check_in_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_logs" ADD CONSTRAINT "offline_check_in_logs_campaign_id_offline_check_in_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offline_check_in_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_logs" ADD CONSTRAINT "offline_check_in_logs_spot_id_offline_check_in_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."offline_check_in_spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_logs" ADD CONSTRAINT "offline_check_in_logs_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_spots" ADD CONSTRAINT "offline_check_in_spots_campaign_id_offline_check_in_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offline_check_in_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_user_progress" ADD CONSTRAINT "offline_check_in_user_progress_campaign_id_offline_check_in_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offline_check_in_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_experiment_id_experiment_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_assignments" ADD CONSTRAINT "experiment_assignments_variant_id_experiment_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."experiment_variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_variants" ADD CONSTRAINT "experiment_variants_experiment_id_experiment_experiments_id_fk" FOREIGN KEY ("experiment_id") REFERENCES "public"."experiment_experiments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "experiment_experiments" ADD CONSTRAINT "experiment_experiments_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_type_id_cms_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."cms_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_types" ADD CONSTRAINT "cms_types_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eu_account" ADD CONSTRAINT "eu_account_user_id_eu_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."eu_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eu_session" ADD CONSTRAINT "eu_session_user_id_eu_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."eu_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eu_session" ADD CONSTRAINT "eu_session_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eu_user" ADD CONSTRAINT "eu_user_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_albums" ADD CONSTRAINT "collection_albums_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entries" ADD CONSTRAINT "collection_entries_album_id_collection_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."collection_albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entries" ADD CONSTRAINT "collection_entries_group_id_collection_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."collection_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entries" ADD CONSTRAINT "collection_entries_trigger_item_definition_id_item_definitions_id_fk" FOREIGN KEY ("trigger_item_definition_id") REFERENCES "public"."item_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_groups" ADD CONSTRAINT "collection_groups_album_id_collection_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."collection_albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_milestones" ADD CONSTRAINT "collection_milestones_album_id_collection_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."collection_albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_milestones" ADD CONSTRAINT "collection_milestones_group_id_collection_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."collection_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_milestones" ADD CONSTRAINT "collection_milestones_entry_id_collection_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."collection_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_user_entries" ADD CONSTRAINT "collection_user_entries_entry_id_collection_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."collection_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_user_milestones" ADD CONSTRAINT "collection_user_milestones_milestone_id_collection_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."collection_milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currencies" ADD CONSTRAINT "currencies_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "currency_wallets" ADD CONSTRAINT "currency_wallets_currency_id_currencies_id_fk" FOREIGN KEY ("currency_id") REFERENCES "public"."currencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialogue_progress" ADD CONSTRAINT "dialogue_progress_script_id_dialogue_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."dialogue_scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialogue_scripts" ADD CONSTRAINT "dialogue_scripts_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_configs" ADD CONSTRAINT "exchange_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_options" ADD CONSTRAINT "exchange_options_config_id_exchange_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."exchange_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_user_states" ADD CONSTRAINT "exchange_user_states_option_id_exchange_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."exchange_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_definitions" ADD CONSTRAINT "item_definitions_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_definitions" ADD CONSTRAINT "item_definitions_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_definitions" ADD CONSTRAINT "item_definitions_lottery_pool_id_lottery_pools_id_fk" FOREIGN KEY ("lottery_pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_inventories" ADD CONSTRAINT "item_inventories_definition_id_item_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."item_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_relationships" ADD CONSTRAINT "invite_relationships_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_settings" ADD CONSTRAINT "invite_settings_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_pity_rules" ADD CONSTRAINT "lottery_pity_rules_pool_id_lottery_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_pity_rules" ADD CONSTRAINT "lottery_pity_rules_guarantee_tier_id_lottery_tiers_id_fk" FOREIGN KEY ("guarantee_tier_id") REFERENCES "public"."lottery_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_pools" ADD CONSTRAINT "lottery_pools_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_tier_id_lottery_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."lottery_tiers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_prizes" ADD CONSTRAINT "lottery_prizes_pool_id_lottery_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_tiers" ADD CONSTRAINT "lottery_tiers_pool_id_lottery_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lottery_user_states" ADD CONSTRAINT "lottery_user_states_pool_id_lottery_pools_id_fk" FOREIGN KEY ("pool_id") REFERENCES "public"."lottery_pools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_user_states" ADD CONSTRAINT "mail_user_states_message_id_mail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_favorites" ADD CONSTRAINT "navigation_favorites_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "navigation_favorites" ADD CONSTRAINT "navigation_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_categories" ADD CONSTRAINT "shop_categories_parent_id_shop_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."shop_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_growth_stage_claims" ADD CONSTRAINT "shop_growth_stage_claims_stage_id_shop_growth_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."shop_growth_stages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_growth_stages" ADD CONSTRAINT "shop_growth_stages_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_product_tags" ADD CONSTRAINT "shop_product_tags_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_product_tags" ADD CONSTRAINT "shop_product_tags_tag_id_shop_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."shop_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_products" ADD CONSTRAINT "shop_products_category_id_shop_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."shop_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_tags" ADD CONSTRAINT "shop_tags_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_user_purchase_states" ADD CONSTRAINT "shop_user_purchase_states_product_id_shop_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."shop_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_settings" ADD CONSTRAINT "friend_settings_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_contribution_logs" ADD CONSTRAINT "guild_contribution_logs_guild_id_guild_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_join_requests" ADD CONSTRAINT "guild_join_requests_guild_id_guild_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_members" ADD CONSTRAINT "guild_members_guild_id_guild_guilds_id_fk" FOREIGN KEY ("guild_id") REFERENCES "public"."guild_guilds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_squad_configs" ADD CONSTRAINT "match_squad_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_squad_invitations" ADD CONSTRAINT "match_squad_invitations_squad_id_match_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."match_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_squad_members" ADD CONSTRAINT "match_squad_members_squad_id_match_squads_id_fk" FOREIGN KEY ("squad_id") REFERENCES "public"."match_squads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_squads" ADD CONSTRAINT "match_squads_config_id_match_squad_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."match_squad_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_gift_sends" ADD CONSTRAINT "friend_gift_sends_package_id_friend_gift_packages_id_fk" FOREIGN KEY ("package_id") REFERENCES "public"."friend_gift_packages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "friend_gift_settings" ADD CONSTRAINT "friend_gift_settings_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_blueprint_skins" ADD CONSTRAINT "entity_blueprint_skins_blueprint_id_entity_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."entity_blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_blueprints" ADD CONSTRAINT "entity_blueprints_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_blueprints" ADD CONSTRAINT "entity_blueprints_schema_id_entity_schemas_id_fk" FOREIGN KEY ("schema_id") REFERENCES "public"."entity_schemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_formation_configs" ADD CONSTRAINT "entity_formation_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_formations" ADD CONSTRAINT "entity_formations_config_id_entity_formation_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."entity_formation_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_instances" ADD CONSTRAINT "entity_instances_blueprint_id_entity_blueprints_id_fk" FOREIGN KEY ("blueprint_id") REFERENCES "public"."entity_blueprints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_instances" ADD CONSTRAINT "entity_instances_skin_id_entity_blueprint_skins_id_fk" FOREIGN KEY ("skin_id") REFERENCES "public"."entity_blueprint_skins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_schemas" ADD CONSTRAINT "entity_schemas_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_slot_assignments" ADD CONSTRAINT "entity_slot_assignments_owner_instance_id_entity_instances_id_fk" FOREIGN KEY ("owner_instance_id") REFERENCES "public"."entity_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_slot_assignments" ADD CONSTRAINT "entity_slot_assignments_equipped_instance_id_entity_instances_id_fk" FOREIGN KEY ("equipped_instance_id") REFERENCES "public"."entity_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_configs" ADD CONSTRAINT "level_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_stages" ADD CONSTRAINT "level_stages_config_id_level_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."level_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_config_id_level_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."level_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_stage_id_level_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."level_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_category_id_task_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."task_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_user_assignments" ADD CONSTRAINT "task_user_assignments_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_user_assignments" ADD CONSTRAINT "task_user_assignments_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_user_milestone_claims" ADD CONSTRAINT "task_user_milestone_claims_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_user_progress" ADD CONSTRAINT "task_user_progress_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_configs" ADD CONSTRAINT "leaderboard_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_config_id_leaderboard_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."leaderboard_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_reward_claims" ADD CONSTRAINT "leaderboard_reward_claims_config_id_leaderboard_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."leaderboard_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leaderboard_snapshots" ADD CONSTRAINT "leaderboard_snapshots_config_id_leaderboard_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."leaderboard_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_configs" ADD CONSTRAINT "activity_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_members" ADD CONSTRAINT "activity_members_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_nodes" ADD CONSTRAINT "activity_nodes_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_point_logs" ADD CONSTRAINT "activity_point_logs_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_schedules" ADD CONSTRAINT "activity_schedules_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_templates" ADD CONSTRAINT "activity_templates_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_user_rewards" ADD CONSTRAINT "activity_user_rewards_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_pool_configs" ADD CONSTRAINT "assist_pool_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_pool_contributions" ADD CONSTRAINT "assist_pool_contributions_instance_id_assist_pool_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."assist_pool_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_pool_instances" ADD CONSTRAINT "assist_pool_instances_config_id_assist_pool_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."assist_pool_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_pool_rewards_ledger" ADD CONSTRAINT "assist_pool_rewards_ledger_instance_id_assist_pool_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."assist_pool_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_box_configs" ADD CONSTRAINT "storage_box_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_box_deposits" ADD CONSTRAINT "storage_box_deposits_box_config_id_storage_box_configs_id_fk" FOREIGN KEY ("box_config_id") REFERENCES "public"."storage_box_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_box_deposits" ADD CONSTRAINT "storage_box_deposits_currency_definition_id_currencies_id_fk" FOREIGN KEY ("currency_definition_id") REFERENCES "public"."currencies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_folder_id_media_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."media_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_folders" ADD CONSTRAINT "media_folders_parent_id_media_folders_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."media_folders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_catalog_entries" ADD CONSTRAINT "event_catalog_entries_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_match_participants" ADD CONSTRAINT "rank_match_participants_match_id_rank_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."rank_matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_matches" ADD CONSTRAINT "rank_matches_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_matches" ADD CONSTRAINT "rank_matches_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_player_states" ADD CONSTRAINT "rank_player_states_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_player_states" ADD CONSTRAINT "rank_player_states_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_player_states" ADD CONSTRAINT "rank_player_states_tier_id_rank_tiers_id_fk" FOREIGN KEY ("tier_id") REFERENCES "public"."rank_tiers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_season_snapshots" ADD CONSTRAINT "rank_season_snapshots_season_id_rank_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."rank_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_seasons" ADD CONSTRAINT "rank_seasons_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_seasons" ADD CONSTRAINT "rank_seasons_tier_config_id_rank_tier_configs_id_fk" FOREIGN KEY ("tier_config_id") REFERENCES "public"."rank_tier_configs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tier_configs" ADD CONSTRAINT "rank_tier_configs_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tiers" ADD CONSTRAINT "rank_tiers_tier_config_id_rank_tier_configs_id_fk" FOREIGN KEY ("tier_config_id") REFERENCES "public"."rank_tier_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_deliveries" ADD CONSTRAINT "webhooks_deliveries_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_deliveries" ADD CONSTRAINT "webhooks_deliveries_endpoint_id_webhooks_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhooks_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_endpoints" ADD CONSTRAINT "webhooks_endpoints_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_executions" ADD CONSTRAINT "trigger_executions_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_executions" ADD CONSTRAINT "trigger_executions_rule_id_trigger_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."trigger_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_rules" ADD CONSTRAINT "trigger_rules_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_unlocks" ADD CONSTRAINT "feature_unlocks_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcements_tenant_alias_uidx" ON "announcements" USING btree ("tenant_id","alias");--> statement-breakpoint
CREATE INDEX "announcements_tenant_visible_idx" ON "announcements" USING btree ("tenant_id","is_active","visible_from","visible_until");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "apikey_configId_idx" ON "apikey" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "apikey_referenceId_idx" ON "apikey" USING btree ("reference_id");--> statement-breakpoint
CREATE INDEX "apikey_key_idx" ON "apikey" USING btree ("key");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organizationRole_organizationId_idx" ON "organization_role" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "organizationRole_role_idx" ON "organization_role" USING btree ("role");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "badge_dismissals_tenant_user_idx" ON "badge_dismissals" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "badge_nodes_org_key_uidx" ON "badge_nodes" USING btree ("tenant_id","key") WHERE "badge_nodes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "badge_nodes_tenant_parent_idx" ON "badge_nodes" USING btree ("tenant_id","parent_key");--> statement-breakpoint
CREATE INDEX "badge_nodes_tenant_prefix_idx" ON "badge_nodes" USING btree ("tenant_id","signal_key_prefix");--> statement-breakpoint
CREATE INDEX "badge_signals_tenant_user_idx" ON "badge_signals" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "badge_signals_cleanup_idx" ON "badge_signals" USING btree ("tenant_id","count","updated_at");--> statement-breakpoint
CREATE INDEX "banner_groups_tenant_idx" ON "banner_groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "banner_groups_tenant_alias_uidx" ON "banner_groups" USING btree ("tenant_id","alias") WHERE "banner_groups"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "banner_groups_activity_idx" ON "banner_groups" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "banners_tenant_group_sort_idx" ON "banners" USING btree ("tenant_id","group_id","sort_order");--> statement-breakpoint
CREATE INDEX "banners_tenant_visible_window_idx" ON "banners" USING btree ("tenant_id","group_id","is_active","visible_from","visible_until");--> statement-breakpoint
CREATE INDEX "banners_multicast_gin_idx" ON "banners" USING gin ("target_user_ids") WHERE "banners"."target_type" = 'multicast';--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_claims_user_level_tier_uidx" ON "battle_pass_claims" USING btree ("season_id","end_user_id","level","tier_code");--> statement-breakpoint
CREATE INDEX "battle_pass_claims_season_idx" ON "battle_pass_claims" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "battle_pass_claims_tenant_user_idx" ON "battle_pass_claims" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "battle_pass_configs_organization_id_idx" ON "battle_pass_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "battle_pass_configs_activity_idx" ON "battle_pass_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_configs_org_code_uidx" ON "battle_pass_configs" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_configs_activity_uidx" ON "battle_pass_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "battle_pass_season_tasks_season_idx" ON "battle_pass_season_tasks" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "battle_pass_season_tasks_task_idx" ON "battle_pass_season_tasks" USING btree ("task_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_season_tasks_season_task_uidx" ON "battle_pass_season_tasks" USING btree ("season_id","task_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "battle_pass_tier_grants_user_tier_uidx" ON "battle_pass_tier_grants" USING btree ("season_id","end_user_id","tier_code");--> statement-breakpoint
CREATE INDEX "battle_pass_tier_grants_season_idx" ON "battle_pass_tier_grants" USING btree ("season_id");--> statement-breakpoint
CREATE INDEX "battle_pass_tier_grants_tenant_user_idx" ON "battle_pass_tier_grants" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "battle_pass_user_progress_tenant_user_idx" ON "battle_pass_user_progress" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "cdkey_batches_tenant_idx" ON "cdkey_batches" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cdkey_batches_tenant_alias_uidx" ON "cdkey_batches" USING btree ("tenant_id","alias") WHERE "cdkey_batches"."alias" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cdkey_codes_org_code_uidx" ON "cdkey_codes" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "cdkey_codes_batch_status_idx" ON "cdkey_codes" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "cdkey_codes_redeemed_by_idx" ON "cdkey_codes" USING btree ("redeemed_by") WHERE "cdkey_codes"."redeemed_by" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cdkey_redemption_logs_source_uidx" ON "cdkey_redemption_logs" USING btree ("tenant_id","source","source_id");--> statement-breakpoint
CREATE INDEX "cdkey_redemption_logs_tenant_user_idx" ON "cdkey_redemption_logs" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "cdkey_redemption_logs_tenant_batch_idx" ON "cdkey_redemption_logs" USING btree ("tenant_id","batch_id");--> statement-breakpoint
CREATE INDEX "cdkey_user_states_tenant_user_idx" ON "cdkey_user_states" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "character_definitions_tenant_idx" ON "character_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_definitions_tenant_alias_uidx" ON "character_definitions" USING btree ("tenant_id","alias") WHERE "character_definitions"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "check_in_configs_organization_id_idx" ON "check_in_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_configs_tenant_alias_uidx" ON "check_in_configs" USING btree ("tenant_id","alias") WHERE "check_in_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "check_in_configs_activity_idx" ON "check_in_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_rewards_config_day_uidx" ON "check_in_rewards" USING btree ("config_id","day_number");--> statement-breakpoint
CREATE INDEX "check_in_rewards_config_idx" ON "check_in_rewards" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "check_in_user_states_tenant_user_idx" ON "check_in_user_states" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "check_in_user_states_config_date_idx" ON "check_in_user_states" USING btree ("config_id","last_check_in_date");--> statement-breakpoint
CREATE INDEX "offline_check_in_campaigns_tenant_status_start_idx" ON "offline_check_in_campaigns" USING btree ("tenant_id","status","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offline_check_in_campaigns_tenant_alias_uidx" ON "offline_check_in_campaigns" USING btree ("tenant_id","alias") WHERE "offline_check_in_campaigns"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "offline_check_in_campaigns_album_idx" ON "offline_check_in_campaigns" USING btree ("collection_album_id");--> statement-breakpoint
CREATE INDEX "offline_check_in_grants_tenant_user_idx" ON "offline_check_in_grants" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "offline_check_in_logs_campaign_user_created_idx" ON "offline_check_in_logs" USING btree ("campaign_id","end_user_id","created_at");--> statement-breakpoint
CREATE INDEX "offline_check_in_logs_spot_created_idx" ON "offline_check_in_logs" USING btree ("spot_id","created_at");--> statement-breakpoint
CREATE INDEX "offline_check_in_logs_tenant_created_idx" ON "offline_check_in_logs" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "offline_check_in_spots_campaign_sort_idx" ON "offline_check_in_spots" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE INDEX "offline_check_in_spots_tenant_idx" ON "offline_check_in_spots" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offline_check_in_spots_campaign_alias_uidx" ON "offline_check_in_spots" USING btree ("campaign_id","alias");--> statement-breakpoint
CREATE INDEX "offline_check_in_user_progress_tenant_user_idx" ON "offline_check_in_user_progress" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "offline_check_in_user_progress_campaign_completed_idx" ON "offline_check_in_user_progress" USING btree ("campaign_id","completed_at");--> statement-breakpoint
CREATE INDEX "experiment_assignments_tenant_user_idx" ON "experiment_assignments" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "experiment_assignments_variant_idx" ON "experiment_assignments" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_variants_experiment_key_uidx" ON "experiment_variants" USING btree ("experiment_id","variant_key");--> statement-breakpoint
CREATE INDEX "experiment_variants_tenant_idx" ON "experiment_variants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "experiment_variants_experiment_sort_idx" ON "experiment_variants" USING btree ("experiment_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "experiment_experiments_org_key_uidx" ON "experiment_experiments" USING btree ("tenant_id","key");--> statement-breakpoint
CREATE INDEX "experiment_experiments_tenant_status_started_idx" ON "experiment_experiments" USING btree ("tenant_id","status","started_at");--> statement-breakpoint
CREATE INDEX "client_credentials_organization_id_idx" ON "client_credentials" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_credentials_publishable_key_uidx" ON "client_credentials" USING btree ("publishable_key");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_entries_org_type_alias_uidx" ON "cms_entries" USING btree ("tenant_id","type_alias","alias");--> statement-breakpoint
CREATE INDEX "cms_entries_tenant_type_group_status_idx" ON "cms_entries" USING btree ("tenant_id","type_alias","group_key","status");--> statement-breakpoint
CREATE INDEX "cms_entries_tags_gin" ON "cms_entries" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "cms_entries_tenant_type_updated_idx" ON "cms_entries" USING btree ("tenant_id","type_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_types_tenant_alias_uidx" ON "cms_types" USING btree ("tenant_id","alias");--> statement-breakpoint
CREATE INDEX "cms_types_tenant_status_idx" ON "cms_types" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "eu_account_user_id_idx" ON "eu_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "eu_session_user_id_idx" ON "eu_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "eu_session_organization_id_idx" ON "eu_session" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "eu_user_organization_id_idx" ON "eu_user" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eu_user_org_external_id_uidx" ON "eu_user" USING btree ("tenant_id","external_id") WHERE "eu_user"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "eu_verification_identifier_idx" ON "eu_verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "collection_albums_tenant_idx" ON "collection_albums" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_albums_tenant_alias_uidx" ON "collection_albums" USING btree ("tenant_id","alias") WHERE "collection_albums"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "collection_entries_album_group_idx" ON "collection_entries" USING btree ("album_id","group_id","sort_order");--> statement-breakpoint
CREATE INDEX "collection_entries_tenant_trigger_idx" ON "collection_entries" USING btree ("tenant_id","trigger_item_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_entries_album_alias_uidx" ON "collection_entries" USING btree ("album_id","alias") WHERE "collection_entries"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "collection_groups_album_idx" ON "collection_groups" USING btree ("album_id","sort_order");--> statement-breakpoint
CREATE INDEX "collection_groups_tenant_idx" ON "collection_groups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "collection_milestones_album_scope_idx" ON "collection_milestones" USING btree ("album_id","scope","threshold");--> statement-breakpoint
CREATE INDEX "collection_milestones_tenant_idx" ON "collection_milestones" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "collection_user_entries_tenant_user_album_idx" ON "collection_user_entries" USING btree ("tenant_id","end_user_id","album_id");--> statement-breakpoint
CREATE INDEX "collection_user_milestones_tenant_user_idx" ON "collection_user_milestones" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "currencies_tenant_idx" ON "currencies" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "currencies_tenant_alias_uidx" ON "currencies" USING btree ("tenant_id","alias") WHERE "currencies"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "currencies_activity_idx" ON "currencies" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "currency_ledger_tenant_user_idx" ON "currency_ledger" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "currency_ledger_source_idx" ON "currency_ledger" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "currency_ledger_currency_idx" ON "currency_ledger" USING btree ("currency_id");--> statement-breakpoint
CREATE INDEX "currency_ledger_activity_idx" ON "currency_ledger" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "currency_wallets_org_user_cur_uidx" ON "currency_wallets" USING btree ("tenant_id","end_user_id","currency_id");--> statement-breakpoint
CREATE INDEX "currency_wallets_tenant_user_idx" ON "currency_wallets" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dialogue_progress_org_user_script_uidx" ON "dialogue_progress" USING btree ("tenant_id","end_user_id","script_id");--> statement-breakpoint
CREATE INDEX "dialogue_progress_tenant_user_idx" ON "dialogue_progress" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "dialogue_scripts_tenant_idx" ON "dialogue_scripts" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dialogue_scripts_tenant_alias_uidx" ON "dialogue_scripts" USING btree ("tenant_id","alias") WHERE "dialogue_scripts"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "exchange_configs_tenant_idx" ON "exchange_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_configs_tenant_alias_uidx" ON "exchange_configs" USING btree ("tenant_id","alias") WHERE "exchange_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "exchange_options_config_idx" ON "exchange_options" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "exchange_options_tenant_idx" ON "exchange_options" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "item_categories_tenant_idx" ON "item_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_categories_tenant_alias_uidx" ON "item_categories" USING btree ("tenant_id","alias") WHERE "item_categories"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "item_definitions_tenant_idx" ON "item_definitions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "item_definitions_category_idx" ON "item_definitions" USING btree ("category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_definitions_tenant_alias_uidx" ON "item_definitions" USING btree ("tenant_id","alias") WHERE "item_definitions"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "item_definitions_activity_idx" ON "item_definitions" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "item_grant_logs_tenant_user_idx" ON "item_grant_logs" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "item_grant_logs_source_idx" ON "item_grant_logs" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "item_grant_logs_activity_idx" ON "item_grant_logs" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "item_inventories_user_def_idx" ON "item_inventories" USING btree ("tenant_id","end_user_id","definition_id");--> statement-breakpoint
CREATE INDEX "item_inventories_tenant_user_idx" ON "item_inventories" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_inventories_singleton_uidx" ON "item_inventories" USING btree ("tenant_id","end_user_id","definition_id") WHERE "item_inventories"."is_singleton" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_codes_org_user_uidx" ON "invite_codes" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_codes_org_code_uidx" ON "invite_codes" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_relationships_org_invitee_uidx" ON "invite_relationships" USING btree ("tenant_id","invitee_end_user_id");--> statement-breakpoint
CREATE INDEX "invite_relationships_tenant_inviter_bound_idx" ON "invite_relationships" USING btree ("tenant_id","inviter_end_user_id","bound_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "invite_relationships_tenant_qualified_idx" ON "invite_relationships" USING btree ("tenant_id","qualified_at") WHERE "invite_relationships"."qualified_at" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "lottery_pity_rules_pool_idx" ON "lottery_pity_rules" USING btree ("pool_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_pity_rules_pool_tier_uidx" ON "lottery_pity_rules" USING btree ("pool_id","guarantee_tier_id");--> statement-breakpoint
CREATE INDEX "lottery_pools_tenant_idx" ON "lottery_pools" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lottery_pools_tenant_alias_uidx" ON "lottery_pools" USING btree ("tenant_id","alias") WHERE "lottery_pools"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "lottery_pools_activity_idx" ON "lottery_pools" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "lottery_prizes_tier_idx" ON "lottery_prizes" USING btree ("tier_id");--> statement-breakpoint
CREATE INDEX "lottery_prizes_pool_idx" ON "lottery_prizes" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "lottery_prizes_tenant_idx" ON "lottery_prizes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "lottery_pull_logs_tenant_user_idx" ON "lottery_pull_logs" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "lottery_pull_logs_pool_user_idx" ON "lottery_pull_logs" USING btree ("pool_id","end_user_id");--> statement-breakpoint
CREATE INDEX "lottery_pull_logs_batch_idx" ON "lottery_pull_logs" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "lottery_pull_logs_created_idx" ON "lottery_pull_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "lottery_tiers_pool_idx" ON "lottery_tiers" USING btree ("pool_id");--> statement-breakpoint
CREATE INDEX "lottery_tiers_tenant_idx" ON "lottery_tiers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "lottery_user_states_tenant_user_idx" ON "lottery_user_states" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "mail_messages_tenant_sent_idx" ON "mail_messages" USING btree ("tenant_id","sent_at");--> statement-breakpoint
CREATE INDEX "mail_messages_tenant_expires_idx" ON "mail_messages" USING btree ("tenant_id","expires_at");--> statement-breakpoint
CREATE INDEX "mail_messages_multicast_gin_idx" ON "mail_messages" USING gin ("target_user_ids") WHERE "mail_messages"."target_type" = 'multicast';--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_origin_uidx" ON "mail_messages" USING btree ("tenant_id","origin_source","origin_source_id") WHERE "mail_messages"."origin_source" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "mail_user_states_user_idx" ON "mail_user_states" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "navigation_favorites_unique" ON "navigation_favorites" USING btree ("tenant_id","user_id","route_path");--> statement-breakpoint
CREATE INDEX "navigation_favorites_lookup" ON "navigation_favorites" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "shop_categories_tenant_idx" ON "shop_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "shop_categories_parent_idx" ON "shop_categories" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_categories_tenant_alias_uidx" ON "shop_categories" USING btree ("tenant_id","alias") WHERE "shop_categories"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shop_growth_stage_claims_tenant_user_product_idx" ON "shop_growth_stage_claims" USING btree ("tenant_id","end_user_id","product_id");--> statement-breakpoint
CREATE INDEX "shop_growth_stages_product_idx" ON "shop_growth_stages" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "shop_growth_stages_tenant_idx" ON "shop_growth_stages" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_growth_stages_product_index_uidx" ON "shop_growth_stages" USING btree ("product_id","stage_index");--> statement-breakpoint
CREATE INDEX "shop_product_tags_tag_idx" ON "shop_product_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "shop_products_tenant_idx" ON "shop_products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "shop_products_tenant_category_idx" ON "shop_products" USING btree ("tenant_id","category_id");--> statement-breakpoint
CREATE INDEX "shop_products_tenant_type_idx" ON "shop_products" USING btree ("tenant_id","product_type");--> statement-breakpoint
CREATE INDEX "shop_products_tenant_window_active_idx" ON "shop_products" USING btree ("tenant_id","time_window_type","is_active");--> statement-breakpoint
CREATE INDEX "shop_products_absolute_window_idx" ON "shop_products" USING btree ("tenant_id","is_active","available_from","available_to") WHERE "shop_products"."time_window_type" = 'absolute';--> statement-breakpoint
CREATE UNIQUE INDEX "shop_products_tenant_alias_uidx" ON "shop_products" USING btree ("tenant_id","alias") WHERE "shop_products"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shop_products_activity_idx" ON "shop_products" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "shop_tags_tenant_idx" ON "shop_tags" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_tags_tenant_alias_uidx" ON "shop_tags" USING btree ("tenant_id","alias") WHERE "shop_tags"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "shop_user_purchase_states_tenant_user_idx" ON "shop_user_purchase_states" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "friend_blocks_tenant_blocker_idx" ON "friend_blocks" USING btree ("tenant_id","blocker_user_id");--> statement-breakpoint
CREATE INDEX "friend_blocks_tenant_blocked_idx" ON "friend_blocks" USING btree ("tenant_id","blocked_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_relationships_org_pair_uidx" ON "friend_relationships" USING btree ("tenant_id","user_a","user_b");--> statement-breakpoint
CREATE INDEX "friend_relationships_tenant_user_a_idx" ON "friend_relationships" USING btree ("tenant_id","user_a");--> statement-breakpoint
CREATE INDEX "friend_relationships_tenant_user_b_idx" ON "friend_relationships" USING btree ("tenant_id","user_b");--> statement-breakpoint
CREATE INDEX "friend_requests_tenant_to_status_idx" ON "friend_requests" USING btree ("tenant_id","to_user_id","status");--> statement-breakpoint
CREATE INDEX "friend_requests_tenant_from_status_idx" ON "friend_requests" USING btree ("tenant_id","from_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_requests_pending_pair_uidx" ON "friend_requests" USING btree ("tenant_id","from_user_id","to_user_id") WHERE "friend_requests"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "friend_settings_org_uidx" ON "friend_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "guild_contribution_logs_guild_user_idx" ON "guild_contribution_logs" USING btree ("guild_id","end_user_id");--> statement-breakpoint
CREATE INDEX "guild_contribution_logs_source_idx" ON "guild_contribution_logs" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "guild_guilds_tenant_idx" ON "guild_guilds" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "guild_guilds_tenant_leader_idx" ON "guild_guilds" USING btree ("tenant_id","leader_user_id");--> statement-breakpoint
CREATE INDEX "guild_guilds_tenant_name_idx" ON "guild_guilds" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "guild_join_requests_guild_status_idx" ON "guild_join_requests" USING btree ("guild_id","status");--> statement-breakpoint
CREATE INDEX "guild_join_requests_tenant_user_status_idx" ON "guild_join_requests" USING btree ("tenant_id","end_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_join_requests_pending_uidx" ON "guild_join_requests" USING btree ("guild_id","end_user_id","type") WHERE "guild_join_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "guild_members_tenant_user_idx" ON "guild_members" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guild_settings_org_uidx" ON "guild_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "match_squad_configs_tenant_idx" ON "match_squad_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "match_squad_configs_tenant_alias_uidx" ON "match_squad_configs" USING btree ("tenant_id","alias") WHERE "match_squad_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "match_squad_invitations_squad_status_idx" ON "match_squad_invitations" USING btree ("squad_id","status");--> statement-breakpoint
CREATE INDEX "match_squad_invitations_tenant_to_status_idx" ON "match_squad_invitations" USING btree ("tenant_id","to_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "match_squad_invitations_pending_uidx" ON "match_squad_invitations" USING btree ("squad_id","to_user_id") WHERE "match_squad_invitations"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "match_squad_members_tenant_user_idx" ON "match_squad_members" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "match_squads_tenant_config_status_idx" ON "match_squads" USING btree ("tenant_id","config_id","status");--> statement-breakpoint
CREATE INDEX "match_squads_tenant_leader_idx" ON "match_squads" USING btree ("tenant_id","config_id","leader_user_id");--> statement-breakpoint
CREATE INDEX "friend_gift_packages_tenant_idx" ON "friend_gift_packages" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_gift_packages_tenant_alias_uidx" ON "friend_gift_packages" USING btree ("tenant_id","alias") WHERE "friend_gift_packages"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "friend_gift_sends_tenant_sender_idx" ON "friend_gift_sends" USING btree ("tenant_id","sender_user_id","created_at");--> statement-breakpoint
CREATE INDEX "friend_gift_sends_tenant_receiver_status_idx" ON "friend_gift_sends" USING btree ("tenant_id","receiver_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "friend_gift_settings_org_uidx" ON "friend_gift_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "entity_action_logs_tenant_user_idx" ON "entity_action_logs" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "entity_action_logs_instance_idx" ON "entity_action_logs" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "entity_action_logs_action_created_idx" ON "entity_action_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE INDEX "entity_blueprint_skins_blueprint_idx" ON "entity_blueprint_skins" USING btree ("blueprint_id");--> statement-breakpoint
CREATE INDEX "entity_blueprint_skins_tenant_idx" ON "entity_blueprint_skins" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_blueprint_skins_bp_alias_uidx" ON "entity_blueprint_skins" USING btree ("blueprint_id","alias") WHERE "entity_blueprint_skins"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_blueprints_tenant_idx" ON "entity_blueprints" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "entity_blueprints_schema_idx" ON "entity_blueprints" USING btree ("schema_id");--> statement-breakpoint
CREATE INDEX "entity_blueprints_tenant_schema_idx" ON "entity_blueprints" USING btree ("tenant_id","schema_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_blueprints_tenant_alias_uidx" ON "entity_blueprints" USING btree ("tenant_id","alias") WHERE "entity_blueprints"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "entity_blueprints_activity_idx" ON "entity_blueprints" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "entity_formation_configs_tenant_idx" ON "entity_formation_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_formation_configs_tenant_alias_uidx" ON "entity_formation_configs" USING btree ("tenant_id","alias") WHERE "entity_formation_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_formations_tenant_user_config_idx_uidx" ON "entity_formations" USING btree ("tenant_id","end_user_id","config_id","formation_index");--> statement-breakpoint
CREATE INDEX "entity_formations_tenant_user_idx" ON "entity_formations" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "entity_instances_tenant_user_idx" ON "entity_instances" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "entity_instances_tenant_user_schema_idx" ON "entity_instances" USING btree ("tenant_id","end_user_id","schema_id");--> statement-breakpoint
CREATE INDEX "entity_instances_tenant_user_bp_idx" ON "entity_instances" USING btree ("tenant_id","end_user_id","blueprint_id");--> statement-breakpoint
CREATE INDEX "entity_instances_activity_idx" ON "entity_instances" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "entity_schemas_tenant_idx" ON "entity_schemas" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_schemas_tenant_alias_uidx" ON "entity_schemas" USING btree ("tenant_id","alias") WHERE "entity_schemas"."alias" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_slot_assignments_equipped_uidx" ON "entity_slot_assignments" USING btree ("equipped_instance_id");--> statement-breakpoint
CREATE INDEX "entity_slot_assignments_tenant_user_idx" ON "entity_slot_assignments" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "level_configs_tenant_idx" ON "level_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "level_configs_tenant_alias_uidx" ON "level_configs" USING btree ("tenant_id","alias") WHERE "level_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "level_stages_config_sort_idx" ON "level_stages" USING btree ("config_id","sort_order");--> statement-breakpoint
CREATE INDEX "level_stages_tenant_idx" ON "level_stages" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "level_user_progress_tenant_user_config_idx" ON "level_user_progress" USING btree ("tenant_id","end_user_id","config_id");--> statement-breakpoint
CREATE INDEX "levels_config_stage_sort_idx" ON "levels" USING btree ("config_id","stage_id","sort_order");--> statement-breakpoint
CREATE INDEX "levels_tenant_idx" ON "levels" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_config_alias_uidx" ON "levels" USING btree ("config_id","alias") WHERE "levels"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "task_categories_tenant_idx" ON "task_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_categories_tenant_alias_uidx" ON "task_categories" USING btree ("tenant_id","alias") WHERE "task_categories"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "task_definitions_tenant_event_idx" ON "task_definitions" USING btree ("tenant_id","event_name");--> statement-breakpoint
CREATE INDEX "task_definitions_tenant_cat_sort_idx" ON "task_definitions" USING btree ("tenant_id","category_id","sort_order");--> statement-breakpoint
CREATE INDEX "task_definitions_tenant_parent_idx" ON "task_definitions" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_definitions_tenant_alias_uidx" ON "task_definitions" USING btree ("tenant_id","alias") WHERE "task_definitions"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "task_definitions_activity_idx" ON "task_definitions" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "task_definitions_tenant_visibility_idx" ON "task_definitions" USING btree ("tenant_id","visibility","is_active");--> statement-breakpoint
CREATE INDEX "task_user_assignments_tenant_user_idx" ON "task_user_assignments" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "task_user_assignments_task_idx" ON "task_user_assignments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_user_assignments_expires_idx" ON "task_user_assignments" USING btree ("expires_at") WHERE "task_user_assignments"."expires_at" IS NOT NULL AND "task_user_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "task_user_milestone_claims_tenant_user_idx" ON "task_user_milestone_claims" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "task_user_milestone_claims_user_task_period_idx" ON "task_user_milestone_claims" USING btree ("end_user_id","task_id","period_key");--> statement-breakpoint
CREATE INDEX "task_user_progress_tenant_user_idx" ON "task_user_progress" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "task_user_progress_task_completed_idx" ON "task_user_progress" USING btree ("task_id","is_completed");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_configs_tenant_alias_uidx" ON "leaderboard_configs" USING btree ("tenant_id","alias");--> statement-breakpoint
CREATE INDEX "leaderboard_configs_tenant_metric_status_idx" ON "leaderboard_configs" USING btree ("tenant_id","metric_key","status");--> statement-breakpoint
CREATE INDEX "leaderboard_configs_activity_idx" ON "leaderboard_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_entries_uidx" ON "leaderboard_entries" USING btree ("config_id","cycle_key","scope_key","end_user_id");--> statement-breakpoint
CREATE INDEX "leaderboard_entries_rank_idx" ON "leaderboard_entries" USING btree ("config_id","cycle_key","scope_key","score");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_reward_claims_uidx" ON "leaderboard_reward_claims" USING btree ("config_id","cycle_key","scope_key","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "leaderboard_snapshots_uidx" ON "leaderboard_snapshots" USING btree ("config_id","cycle_key","scope_key");--> statement-breakpoint
CREATE INDEX "leaderboard_snapshots_tenant_settled_idx" ON "leaderboard_snapshots" USING btree ("tenant_id","settled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_configs_tenant_alias_uidx" ON "activity_configs" USING btree ("tenant_id","alias");--> statement-breakpoint
CREATE INDEX "activity_configs_tenant_status_start_idx" ON "activity_configs" USING btree ("tenant_id","status","start_at");--> statement-breakpoint
CREATE INDEX "activity_configs_status_lifecycle_idx" ON "activity_configs" USING btree ("status","visible_at","start_at","end_at","hidden_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_members_uidx" ON "activity_members" USING btree ("activity_id","end_user_id");--> statement-breakpoint
CREATE INDEX "activity_members_activity_status_idx" ON "activity_members" USING btree ("activity_id","status");--> statement-breakpoint
CREATE INDEX "activity_members_tenant_user_idx" ON "activity_members" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_members_queue_number_uidx" ON "activity_members" USING btree ("activity_id","queue_number") WHERE queue_number IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_nodes_activity_alias_uidx" ON "activity_nodes" USING btree ("activity_id","alias");--> statement-breakpoint
CREATE INDEX "activity_nodes_activity_order_idx" ON "activity_nodes" USING btree ("activity_id","order_index");--> statement-breakpoint
CREATE INDEX "activity_point_logs_activity_user_idx" ON "activity_point_logs" USING btree ("activity_id","end_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_schedules_activity_alias_uidx" ON "activity_schedules" USING btree ("activity_id","alias");--> statement-breakpoint
CREATE INDEX "activity_schedules_due_idx" ON "activity_schedules" USING btree ("enabled","next_fire_at") WHERE enabled = true;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_templates_tenant_alias_uidx" ON "activity_templates" USING btree ("tenant_id","alias");--> statement-breakpoint
CREATE INDEX "activity_templates_due_idx" ON "activity_templates" USING btree ("enabled","next_instance_at") WHERE enabled = true;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_user_rewards_uidx" ON "activity_user_rewards" USING btree ("activity_id","end_user_id","reward_key");--> statement-breakpoint
CREATE INDEX "activity_user_rewards_tenant_user_idx" ON "activity_user_rewards" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "assist_pool_configs_tenant_idx" ON "assist_pool_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assist_pool_configs_tenant_alias_uidx" ON "assist_pool_configs" USING btree ("tenant_id","alias") WHERE "assist_pool_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "assist_pool_configs_activity_idx" ON "assist_pool_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "assist_pool_contributions_instance_assister_idx" ON "assist_pool_contributions" USING btree ("instance_id","assister_end_user_id");--> statement-breakpoint
CREATE INDEX "assist_pool_contributions_instance_created_idx" ON "assist_pool_contributions" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE INDEX "assist_pool_instances_config_idx" ON "assist_pool_instances" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "assist_pool_instances_initiator_idx" ON "assist_pool_instances" USING btree ("tenant_id","initiator_end_user_id");--> statement-breakpoint
CREATE INDEX "assist_pool_instances_due_idx" ON "assist_pool_instances" USING btree ("status","expires_at") WHERE status = 'in_progress';--> statement-breakpoint
CREATE UNIQUE INDEX "assist_pool_rewards_ledger_instance_uidx" ON "assist_pool_rewards_ledger" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "assist_pool_rewards_ledger_tenant_initiator_idx" ON "assist_pool_rewards_ledger" USING btree ("tenant_id","initiator_end_user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_ts_idx" ON "audit_logs" USING btree ("tenant_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_resource_idx" ON "audit_logs" USING btree ("tenant_id","resource_type","resource_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_actor_idx" ON "audit_logs" USING btree ("tenant_id","actor_type","actor_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_action_idx" ON "audit_logs" USING btree ("tenant_id","action","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "storage_box_configs_tenant_idx" ON "storage_box_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_box_configs_tenant_alias_uidx" ON "storage_box_configs" USING btree ("tenant_id","alias") WHERE "storage_box_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "storage_box_deposits_tenant_user_idx" ON "storage_box_deposits" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "storage_box_deposits_box_idx" ON "storage_box_deposits" USING btree ("box_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_box_deposits_demand_uidx" ON "storage_box_deposits" USING btree ("tenant_id","end_user_id","box_config_id","currency_definition_id") WHERE "storage_box_deposits"."is_singleton" = true AND "storage_box_deposits"."status" = 'active';--> statement-breakpoint
CREATE INDEX "storage_box_logs_tenant_user_idx" ON "storage_box_logs" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "storage_box_logs_deposit_idx" ON "storage_box_logs" USING btree ("deposit_id");--> statement-breakpoint
CREATE INDEX "media_assets_tenant_folder_created_idx" ON "media_assets" USING btree ("tenant_id","folder_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_object_key_uidx" ON "media_assets" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "media_folders_tenant_parent_idx" ON "media_folders" USING btree ("tenant_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_folders_name_under_parent_uidx" ON "media_folders" USING btree ("tenant_id","parent_id","name") WHERE "media_folders"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_folders_name_at_root_uidx" ON "media_folders" USING btree ("tenant_id","name") WHERE "media_folders"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_folders_org_default_uidx" ON "media_folders" USING btree ("tenant_id") WHERE "media_folders"."is_default" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "event_catalog_org_name_uidx" ON "event_catalog_entries" USING btree ("tenant_id","event_name");--> statement-breakpoint
CREATE INDEX "event_catalog_tenant_last_seen_idx" ON "event_catalog_entries" USING btree ("tenant_id","last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_match_participants_match_user_uidx" ON "rank_match_participants" USING btree ("match_id","end_user_id");--> statement-breakpoint
CREATE INDEX "rank_match_participants_user_recent_idx" ON "rank_match_participants" USING btree ("tenant_id","season_id","end_user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_matches_org_external_uidx" ON "rank_matches" USING btree ("tenant_id","external_match_id");--> statement-breakpoint
CREATE INDEX "rank_matches_season_settled_idx" ON "rank_matches" USING btree ("season_id","settled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_player_states_season_user_uidx" ON "rank_player_states" USING btree ("season_id","end_user_id");--> statement-breakpoint
CREATE INDEX "rank_player_states_tenant_season_idx" ON "rank_player_states" USING btree ("tenant_id","season_id");--> statement-breakpoint
CREATE INDEX "rank_player_states_season_score_idx" ON "rank_player_states" USING btree ("season_id","rank_score");--> statement-breakpoint
CREATE INDEX "rank_player_states_season_tier_idx" ON "rank_player_states" USING btree ("season_id","tier_id","rank_score");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_season_snapshots_uidx" ON "rank_season_snapshots" USING btree ("season_id","end_user_id");--> statement-breakpoint
CREATE INDEX "rank_season_snapshots_season_rank_idx" ON "rank_season_snapshots" USING btree ("season_id","final_global_rank");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_seasons_tenant_alias_uidx" ON "rank_seasons" USING btree ("tenant_id","alias");--> statement-breakpoint
CREATE INDEX "rank_seasons_config_status_idx" ON "rank_seasons" USING btree ("tier_config_id","status");--> statement-breakpoint
CREATE INDEX "rank_seasons_tenant_status_idx" ON "rank_seasons" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "rank_seasons_window_idx" ON "rank_seasons" USING btree ("tenant_id","start_at","end_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tier_configs_tenant_alias_uidx" ON "rank_tier_configs" USING btree ("tenant_id","alias");--> statement-breakpoint
CREATE INDEX "rank_tier_configs_tenant_active_idx" ON "rank_tier_configs" USING btree ("tenant_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tiers_config_alias_uidx" ON "rank_tiers" USING btree ("tier_config_id","alias");--> statement-breakpoint
CREATE UNIQUE INDEX "rank_tiers_config_order_uidx" ON "rank_tiers" USING btree ("tier_config_id","order");--> statement-breakpoint
CREATE INDEX "rank_tiers_config_score_idx" ON "rank_tiers" USING btree ("tier_config_id","min_rank_score","max_rank_score");--> statement-breakpoint
CREATE INDEX "webhooks_deliveries_due_idx" ON "webhooks_deliveries" USING btree ("status","next_attempt_at") WHERE status in ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "webhooks_deliveries_tenant_event_type_idx" ON "webhooks_deliveries" USING btree ("tenant_id","event_type");--> statement-breakpoint
CREATE INDEX "webhooks_deliveries_endpoint_created_idx" ON "webhooks_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "webhooks_endpoints_tenant_idx" ON "webhooks_endpoints" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "webhooks_endpoints_tenant_status_idx" ON "webhooks_endpoints" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "trigger_executions_tenant_rule_started_idx" ON "trigger_executions" USING btree ("tenant_id","rule_id","started_at");--> statement-breakpoint
CREATE INDEX "trigger_executions_tenant_status_started_idx" ON "trigger_executions" USING btree ("tenant_id","status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_rules_tenant_name_idx" ON "trigger_rules" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "trigger_rules_tenant_event_status_idx" ON "trigger_rules" USING btree ("tenant_id","trigger_event","status");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_unlocks_tenant_user_key_idx" ON "feature_unlocks" USING btree ("tenant_id","end_user_id","feature_key");--> statement-breakpoint
CREATE INDEX "feature_unlocks_tenant_user_idx" ON "feature_unlocks" USING btree ("tenant_id","end_user_id");--> statement-breakpoint
CREATE INDEX "feature_unlocks_tenant_key_idx" ON "feature_unlocks" USING btree ("tenant_id","feature_key");