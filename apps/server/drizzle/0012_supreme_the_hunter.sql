CREATE TABLE "collection_albums" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"icon" text,
	"scope" text DEFAULT 'custom' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
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
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"rarity" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
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
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_milestones" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"album_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"group_id" uuid,
	"entry_id" uuid,
	"threshold" integer DEFAULT 1 NOT NULL,
	"label" text,
	"reward_items" jsonb NOT NULL,
	"auto_claim" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_user_entries" (
	"entry_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
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
	"organization_id" text NOT NULL,
	"album_id" uuid NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	"delivery_mode" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "collection_user_milestones_pk" PRIMARY KEY("milestone_id","end_user_id")
);
--> statement-breakpoint
ALTER TABLE "collection_albums" ADD CONSTRAINT "collection_albums_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entries" ADD CONSTRAINT "collection_entries_album_id_collection_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."collection_albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entries" ADD CONSTRAINT "collection_entries_group_id_collection_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."collection_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_entries" ADD CONSTRAINT "collection_entries_trigger_item_definition_id_item_definitions_id_fk" FOREIGN KEY ("trigger_item_definition_id") REFERENCES "public"."item_definitions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_groups" ADD CONSTRAINT "collection_groups_album_id_collection_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."collection_albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_milestones" ADD CONSTRAINT "collection_milestones_album_id_collection_albums_id_fk" FOREIGN KEY ("album_id") REFERENCES "public"."collection_albums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_milestones" ADD CONSTRAINT "collection_milestones_group_id_collection_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."collection_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_milestones" ADD CONSTRAINT "collection_milestones_entry_id_collection_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."collection_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_user_entries" ADD CONSTRAINT "collection_user_entries_entry_id_collection_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."collection_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_user_milestones" ADD CONSTRAINT "collection_user_milestones_milestone_id_collection_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."collection_milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "collection_albums_org_idx" ON "collection_albums" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_albums_org_alias_uidx" ON "collection_albums" USING btree ("organization_id","alias") WHERE "collection_albums"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "collection_entries_album_group_idx" ON "collection_entries" USING btree ("album_id","group_id","sort_order");--> statement-breakpoint
CREATE INDEX "collection_entries_org_trigger_idx" ON "collection_entries" USING btree ("organization_id","trigger_item_definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_entries_album_alias_uidx" ON "collection_entries" USING btree ("album_id","alias") WHERE "collection_entries"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "collection_groups_album_idx" ON "collection_groups" USING btree ("album_id","sort_order");--> statement-breakpoint
CREATE INDEX "collection_groups_org_idx" ON "collection_groups" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "collection_milestones_album_scope_idx" ON "collection_milestones" USING btree ("album_id","scope","threshold");--> statement-breakpoint
CREATE INDEX "collection_milestones_org_idx" ON "collection_milestones" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "collection_user_entries_org_user_album_idx" ON "collection_user_entries" USING btree ("organization_id","end_user_id","album_id");--> statement-breakpoint
CREATE INDEX "collection_user_milestones_org_user_idx" ON "collection_user_milestones" USING btree ("organization_id","end_user_id");