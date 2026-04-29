CREATE TABLE "trigger_executions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"rule_id" uuid NOT NULL,
	"rule_version" integer NOT NULL,
	"event_name" text NOT NULL,
	"end_user_id" text,
	"trace_id" text,
	"condition_result" text,
	"action_results" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp,
	"status" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_rules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'active' NOT NULL,
	"trigger_event" text NOT NULL,
	"condition" jsonb,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"throttle" jsonb,
	"graph" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feature_unlocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"feature_key" text NOT NULL,
	"source" text,
	"source_ref" text,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trigger_executions" ADD CONSTRAINT "trigger_executions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_executions" ADD CONSTRAINT "trigger_executions_rule_id_trigger_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."trigger_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_rules" ADD CONSTRAINT "trigger_rules_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_unlocks" ADD CONSTRAINT "feature_unlocks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trigger_executions_org_rule_started_idx" ON "trigger_executions" USING btree ("organization_id","rule_id","started_at");--> statement-breakpoint
CREATE INDEX "trigger_executions_org_status_started_idx" ON "trigger_executions" USING btree ("organization_id","status","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "trigger_rules_org_name_idx" ON "trigger_rules" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "trigger_rules_org_event_status_idx" ON "trigger_rules" USING btree ("organization_id","trigger_event","status");--> statement-breakpoint
CREATE UNIQUE INDEX "feature_unlocks_org_user_key_idx" ON "feature_unlocks" USING btree ("organization_id","end_user_id","feature_key");--> statement-breakpoint
CREATE INDEX "feature_unlocks_org_user_idx" ON "feature_unlocks" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "feature_unlocks_org_key_idx" ON "feature_unlocks" USING btree ("organization_id","feature_key");