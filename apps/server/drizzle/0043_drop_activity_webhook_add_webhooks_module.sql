-- Drop any activity schedules that still reference the removed `webhook_call`
-- action (product has not launched, safe to purge rather than migrate).
DELETE FROM "activity_schedules" WHERE "action_type" = 'webhook_call';--> statement-breakpoint
CREATE TABLE "webhooks_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
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
	"organization_id" text NOT NULL,
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
DROP TABLE "webhook_deliveries" CASCADE;--> statement-breakpoint
DROP TABLE "webhook_endpoints" CASCADE;--> statement-breakpoint
ALTER TABLE "webhooks_deliveries" ADD CONSTRAINT "webhooks_deliveries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_deliveries" ADD CONSTRAINT "webhooks_deliveries_endpoint_id_webhooks_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhooks_endpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhooks_endpoints" ADD CONSTRAINT "webhooks_endpoints_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "webhooks_deliveries_due_idx" ON "webhooks_deliveries" USING btree ("status","next_attempt_at") WHERE status in ('pending', 'failed');--> statement-breakpoint
CREATE INDEX "webhooks_deliveries_org_event_type_idx" ON "webhooks_deliveries" USING btree ("organization_id","event_type");--> statement-breakpoint
CREATE INDEX "webhooks_deliveries_endpoint_created_idx" ON "webhooks_deliveries" USING btree ("endpoint_id","created_at");--> statement-breakpoint
CREATE INDEX "webhooks_endpoints_org_idx" ON "webhooks_endpoints" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "webhooks_endpoints_org_status_idx" ON "webhooks_endpoints" USING btree ("organization_id","status");