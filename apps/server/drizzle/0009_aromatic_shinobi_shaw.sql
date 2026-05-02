CREATE TABLE "offline_check_in_campaigns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
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
	"organization_id" text NOT NULL,
	"reward_items" jsonb NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offline_check_in_grants_pk" PRIMARY KEY("campaign_id","end_user_id","reward_key")
);
--> statement-breakpoint
CREATE TABLE "offline_check_in_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"spot_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
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
	"organization_id" text NOT NULL,
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
	"organization_id" text NOT NULL,
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
ALTER TABLE "offline_check_in_campaigns" ADD CONSTRAINT "offline_check_in_campaigns_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_campaigns" ADD CONSTRAINT "offline_check_in_campaigns_collection_album_id_collection_albums_id_fk" FOREIGN KEY ("collection_album_id") REFERENCES "public"."collection_albums"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_grants" ADD CONSTRAINT "offline_check_in_grants_campaign_id_offline_check_in_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offline_check_in_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_logs" ADD CONSTRAINT "offline_check_in_logs_campaign_id_offline_check_in_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offline_check_in_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_logs" ADD CONSTRAINT "offline_check_in_logs_spot_id_offline_check_in_spots_id_fk" FOREIGN KEY ("spot_id") REFERENCES "public"."offline_check_in_spots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_logs" ADD CONSTRAINT "offline_check_in_logs_media_asset_id_media_assets_id_fk" FOREIGN KEY ("media_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_spots" ADD CONSTRAINT "offline_check_in_spots_campaign_id_offline_check_in_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offline_check_in_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offline_check_in_user_progress" ADD CONSTRAINT "offline_check_in_user_progress_campaign_id_offline_check_in_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."offline_check_in_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "offline_check_in_campaigns_org_status_start_idx" ON "offline_check_in_campaigns" USING btree ("organization_id","status","start_at");--> statement-breakpoint
CREATE UNIQUE INDEX "offline_check_in_campaigns_org_alias_uidx" ON "offline_check_in_campaigns" USING btree ("organization_id","alias") WHERE "offline_check_in_campaigns"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "offline_check_in_campaigns_album_idx" ON "offline_check_in_campaigns" USING btree ("collection_album_id");--> statement-breakpoint
CREATE INDEX "offline_check_in_grants_org_user_idx" ON "offline_check_in_grants" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "offline_check_in_logs_campaign_user_created_idx" ON "offline_check_in_logs" USING btree ("campaign_id","end_user_id","created_at");--> statement-breakpoint
CREATE INDEX "offline_check_in_logs_spot_created_idx" ON "offline_check_in_logs" USING btree ("spot_id","created_at");--> statement-breakpoint
CREATE INDEX "offline_check_in_logs_org_created_idx" ON "offline_check_in_logs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "offline_check_in_spots_campaign_sort_idx" ON "offline_check_in_spots" USING btree ("campaign_id","sort_order");--> statement-breakpoint
CREATE INDEX "offline_check_in_spots_org_idx" ON "offline_check_in_spots" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offline_check_in_spots_campaign_alias_uidx" ON "offline_check_in_spots" USING btree ("campaign_id","alias");--> statement-breakpoint
CREATE INDEX "offline_check_in_user_progress_org_user_idx" ON "offline_check_in_user_progress" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "offline_check_in_user_progress_campaign_completed_idx" ON "offline_check_in_user_progress" USING btree ("campaign_id","completed_at");