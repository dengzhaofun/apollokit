CREATE TABLE "banner_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"layout" text DEFAULT 'carousel' NOT NULL,
	"interval_ms" integer DEFAULT 4000 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "banners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"image_url_mobile" text NOT NULL,
	"image_url_desktop" text NOT NULL,
	"alt_text" text,
	"link_action" jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
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
CREATE TABLE "dialogue_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
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
	"organization_id" text NOT NULL,
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
ALTER TABLE "banner_groups" ADD CONSTRAINT "banner_groups_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_group_id_banner_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."banner_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialogue_progress" ADD CONSTRAINT "dialogue_progress_script_id_dialogue_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."dialogue_scripts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dialogue_scripts" ADD CONSTRAINT "dialogue_scripts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "banner_groups_org_idx" ON "banner_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "banner_groups_org_alias_uidx" ON "banner_groups" USING btree ("organization_id","alias") WHERE "banner_groups"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "banners_org_group_sort_idx" ON "banners" USING btree ("organization_id","group_id","sort_order");--> statement-breakpoint
CREATE INDEX "banners_org_visible_window_idx" ON "banners" USING btree ("organization_id","group_id","is_active","visible_from","visible_until");--> statement-breakpoint
CREATE INDEX "banners_multicast_gin_idx" ON "banners" USING gin ("target_user_ids") WHERE "banners"."target_type" = 'multicast';--> statement-breakpoint
CREATE UNIQUE INDEX "dialogue_progress_org_user_script_uidx" ON "dialogue_progress" USING btree ("organization_id","end_user_id","script_id");--> statement-breakpoint
CREATE INDEX "dialogue_progress_org_user_idx" ON "dialogue_progress" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "dialogue_scripts_org_idx" ON "dialogue_scripts" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dialogue_scripts_org_alias_uidx" ON "dialogue_scripts" USING btree ("organization_id","alias") WHERE "dialogue_scripts"."alias" IS NOT NULL;