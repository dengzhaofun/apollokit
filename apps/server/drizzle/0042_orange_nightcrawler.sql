CREATE TABLE "badge_dismissals" (
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"node_key" text NOT NULL,
	"dismissed_version" text,
	"dismissed_at" timestamp DEFAULT now() NOT NULL,
	"period_key" text,
	"session_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "badge_dismissals_pk" PRIMARY KEY("organization_id","end_user_id","node_key")
);
--> statement-breakpoint
CREATE TABLE "badge_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
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
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "badge_signal_registry" (
	"organization_id" text NOT NULL,
	"key_pattern" text NOT NULL,
	"is_dynamic" boolean DEFAULT false NOT NULL,
	"label" text NOT NULL,
	"description" text,
	"example_meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "badge_signal_registry_pk" PRIMARY KEY("organization_id","key_pattern")
);
--> statement-breakpoint
CREATE TABLE "badge_signals" (
	"organization_id" text NOT NULL,
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
	CONSTRAINT "badge_signals_pk" PRIMARY KEY("organization_id","end_user_id","signal_key")
);
--> statement-breakpoint
ALTER TABLE "badge_nodes" ADD CONSTRAINT "badge_nodes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badge_signal_registry" ADD CONSTRAINT "badge_signal_registry_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "badge_dismissals_org_user_idx" ON "badge_dismissals" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "badge_nodes_org_key_uidx" ON "badge_nodes" USING btree ("organization_id","key") WHERE "badge_nodes"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "badge_nodes_org_parent_idx" ON "badge_nodes" USING btree ("organization_id","parent_key");--> statement-breakpoint
CREATE INDEX "badge_nodes_org_prefix_idx" ON "badge_nodes" USING btree ("organization_id","signal_key_prefix");--> statement-breakpoint
CREATE INDEX "badge_signals_org_user_idx" ON "badge_signals" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "badge_signals_cleanup_idx" ON "badge_signals" USING btree ("organization_id","count","updated_at");