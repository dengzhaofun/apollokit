CREATE TABLE "level_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"cover_image" text,
	"icon" text,
	"has_stages" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_stages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"config_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"unlock_rule" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "level_user_progress" (
	"level_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
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
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"difficulty" text,
	"max_stars" integer DEFAULT 3 NOT NULL,
	"unlock_rule" jsonb,
	"clear_rewards" jsonb,
	"star_rewards" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "level_configs" ADD CONSTRAINT "level_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_stages" ADD CONSTRAINT "level_stages_config_id_level_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."level_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_config_id_level_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."level_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "levels" ADD CONSTRAINT "levels_stage_id_level_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."level_stages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "level_configs_org_idx" ON "level_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "level_configs_org_alias_uidx" ON "level_configs" USING btree ("organization_id","alias") WHERE "level_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "level_stages_config_sort_idx" ON "level_stages" USING btree ("config_id","sort_order");--> statement-breakpoint
CREATE INDEX "level_stages_org_idx" ON "level_stages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "level_user_progress_org_user_config_idx" ON "level_user_progress" USING btree ("organization_id","end_user_id","config_id");--> statement-breakpoint
CREATE INDEX "levels_config_stage_sort_idx" ON "levels" USING btree ("config_id","stage_id","sort_order");--> statement-breakpoint
CREATE INDEX "levels_org_idx" ON "levels" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "levels_config_alias_uidx" ON "levels" USING btree ("config_id","alias") WHERE "levels"."alias" IS NOT NULL;