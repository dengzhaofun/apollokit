CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
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
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_org_ts_idx" ON "audit_logs" USING btree ("organization_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_org_resource_idx" ON "audit_logs" USING btree ("organization_id","resource_type","resource_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_org_actor_idx" ON "audit_logs" USING btree ("organization_id","actor_type","actor_id","ts" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_logs_org_action_idx" ON "audit_logs" USING btree ("organization_id","action","ts" DESC NULLS LAST);