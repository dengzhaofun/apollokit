CREATE TABLE "task_user_assignments" (
	"task_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
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
ALTER TABLE "task_definitions" ADD COLUMN "visibility" text DEFAULT 'broadcast' NOT NULL;--> statement-breakpoint
ALTER TABLE "task_definitions" ADD COLUMN "default_assignment_ttl_seconds" integer;--> statement-breakpoint
ALTER TABLE "task_user_assignments" ADD CONSTRAINT "task_user_assignments_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_user_assignments" ADD CONSTRAINT "task_user_assignments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_user_assignments_org_user_idx" ON "task_user_assignments" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "task_user_assignments_task_idx" ON "task_user_assignments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_user_assignments_expires_idx" ON "task_user_assignments" USING btree ("expires_at") WHERE "task_user_assignments"."expires_at" IS NOT NULL AND "task_user_assignments"."revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX "task_definitions_org_visibility_idx" ON "task_definitions" USING btree ("organization_id","visibility","is_active");