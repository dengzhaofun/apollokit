CREATE TABLE "activity_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"banner_image" text,
	"theme_color" text,
	"kind" text DEFAULT 'generic' NOT NULL,
	"visible_at" timestamp NOT NULL,
	"start_at" timestamp NOT NULL,
	"end_at" timestamp NOT NULL,
	"reward_end_at" timestamp NOT NULL,
	"hidden_at" timestamp NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"currency" jsonb,
	"milestone_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"global_rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kind_metadata" jsonb,
	"cleanup_rule" jsonb DEFAULT '{"mode":"purge"}'::jsonb NOT NULL,
	"join_requirement" jsonb,
	"visibility" text DEFAULT 'public' NOT NULL,
	"template_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_nodes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"node_type" text NOT NULL,
	"ref_id" uuid,
	"order_index" integer DEFAULT 0 NOT NULL,
	"unlock_rule" jsonb DEFAULT 'null'::jsonb,
	"node_config" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_point_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"delta" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"source" text NOT NULL,
	"source_ref" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"trigger_kind" text NOT NULL,
	"cron_expr" text,
	"fire_at" timestamp,
	"offset_from" text,
	"offset_seconds" integer,
	"action_type" text NOT NULL,
	"action_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_fired_at" timestamp,
	"last_status" text,
	"next_fire_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_user_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"activity_points" bigint DEFAULT 0 NOT NULL,
	"milestones_achieved" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"node_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'joined' NOT NULL,
	"completed_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_user_rewards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"reward_key" text NOT NULL,
	"rewards" jsonb NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"endpoint_alias" text NOT NULL,
	"event_name" text NOT NULL,
	"payload" jsonb NOT NULL,
	"source_schedule_id" uuid,
	"attempt" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"last_status_code" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"response_body_preview" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"url" text NOT NULL,
	"secret" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"retry_policy" jsonb DEFAULT '{"maxAttempts":5,"backoffBaseSeconds":60}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_configs" ADD CONSTRAINT "activity_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_nodes" ADD CONSTRAINT "activity_nodes_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_point_logs" ADD CONSTRAINT "activity_point_logs_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_schedules" ADD CONSTRAINT "activity_schedules_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_user_progress" ADD CONSTRAINT "activity_user_progress_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_user_rewards" ADD CONSTRAINT "activity_user_rewards_activity_id_activity_configs_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_configs_org_alias_uidx" ON "activity_configs" USING btree ("organization_id","alias");--> statement-breakpoint
CREATE INDEX "activity_configs_org_status_start_idx" ON "activity_configs" USING btree ("organization_id","status","start_at");--> statement-breakpoint
CREATE INDEX "activity_configs_status_lifecycle_idx" ON "activity_configs" USING btree ("status","visible_at","start_at","end_at","reward_end_at","hidden_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_nodes_activity_alias_uidx" ON "activity_nodes" USING btree ("activity_id","alias");--> statement-breakpoint
CREATE INDEX "activity_nodes_activity_order_idx" ON "activity_nodes" USING btree ("activity_id","order_index");--> statement-breakpoint
CREATE INDEX "activity_point_logs_activity_user_idx" ON "activity_point_logs" USING btree ("activity_id","end_user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_schedules_activity_alias_uidx" ON "activity_schedules" USING btree ("activity_id","alias");--> statement-breakpoint
CREATE INDEX "activity_schedules_due_idx" ON "activity_schedules" USING btree ("enabled","next_fire_at") WHERE enabled = true;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_user_progress_uidx" ON "activity_user_progress" USING btree ("activity_id","end_user_id");--> statement-breakpoint
CREATE INDEX "activity_user_progress_activity_status_idx" ON "activity_user_progress" USING btree ("activity_id","status");--> statement-breakpoint
CREATE INDEX "activity_user_progress_org_user_idx" ON "activity_user_progress" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_user_rewards_uidx" ON "activity_user_rewards" USING btree ("activity_id","end_user_id","reward_key");--> statement-breakpoint
CREATE INDEX "activity_user_rewards_org_user_idx" ON "activity_user_rewards" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "webhook_deliveries_due_idx" ON "webhook_deliveries" USING btree ("status","next_attempt_at") WHERE status in ('pending', 'in_flight');--> statement-breakpoint
CREATE INDEX "webhook_deliveries_source_schedule_idx" ON "webhook_deliveries" USING btree ("source_schedule_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_endpoints_org_alias_uidx" ON "webhook_endpoints" USING btree ("organization_id","alias");