CREATE TABLE "task_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"scope" text DEFAULT 'task' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
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
	"target_value" integer NOT NULL,
	"parent_progress_value" integer DEFAULT 1 NOT NULL,
	"prerequisite_task_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rewards" jsonb NOT NULL,
	"auto_claim" boolean DEFAULT false NOT NULL,
	"navigation" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_hidden" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_user_progress" (
	"task_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
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
ALTER TABLE "task_categories" ADD CONSTRAINT "task_categories_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD CONSTRAINT "task_definitions_category_id_task_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."task_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_user_progress" ADD CONSTRAINT "task_user_progress_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_categories_org_idx" ON "task_categories" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_categories_org_alias_uidx" ON "task_categories" USING btree ("organization_id","alias") WHERE "task_categories"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "task_definitions_org_event_idx" ON "task_definitions" USING btree ("organization_id","event_name");--> statement-breakpoint
CREATE INDEX "task_definitions_org_cat_sort_idx" ON "task_definitions" USING btree ("organization_id","category_id","sort_order");--> statement-breakpoint
CREATE INDEX "task_definitions_org_parent_idx" ON "task_definitions" USING btree ("organization_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_definitions_org_alias_uidx" ON "task_definitions" USING btree ("organization_id","alias") WHERE "task_definitions"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "task_user_progress_org_user_idx" ON "task_user_progress" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "task_user_progress_task_completed_idx" ON "task_user_progress" USING btree ("task_id","is_completed");