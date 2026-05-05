CREATE TABLE "page_form_submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"block_id" text NOT NULL,
	"end_user_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_project_conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"message_id" text NOT NULL,
	"role" text NOT NULL,
	"content" jsonb NOT NULL,
	"proposed_version_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_project_versions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"label" text,
	"schema" jsonb NOT NULL,
	"parent_version_id" uuid,
	"author_type" text NOT NULL,
	"author_id" text,
	"conversation_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"auth_mode" text NOT NULL,
	"client_credential_id" uuid,
	"bound_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_version_id" uuid,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"cover_image_url" text,
	"schema" jsonb NOT NULL,
	"required_modules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_official" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "page_form_submissions" ADD CONSTRAINT "page_form_submissions_project_id_page_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."page_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_project_conversations" ADD CONSTRAINT "page_project_conversations_project_id_page_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."page_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_project_versions" ADD CONSTRAINT "page_project_versions_project_id_page_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."page_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_projects" ADD CONSTRAINT "page_projects_tenant_id_team_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "page_form_submissions_project_created_idx" ON "page_form_submissions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "page_form_submissions_block_idx" ON "page_form_submissions" USING btree ("project_id","page_id","block_id");--> statement-breakpoint
CREATE UNIQUE INDEX "page_project_conversations_msg_uidx" ON "page_project_conversations" USING btree ("project_id","message_id");--> statement-breakpoint
CREATE INDEX "page_project_conversations_project_created_idx" ON "page_project_conversations" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_project_versions_project_number_uidx" ON "page_project_versions" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "page_project_versions_project_created_idx" ON "page_project_versions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "page_projects_slug_uidx" ON "page_projects" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "page_projects_tenant_idx" ON "page_projects" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "page_projects_status_idx" ON "page_projects" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "page_templates_slug_uidx" ON "page_templates" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "page_templates_category_idx" ON "page_templates" USING btree ("category","sort_order");