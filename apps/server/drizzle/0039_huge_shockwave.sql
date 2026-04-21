CREATE TABLE "assist_pool_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"mode" text DEFAULT 'decrement' NOT NULL,
	"target_amount" bigint NOT NULL,
	"contribution_policy" jsonb NOT NULL,
	"per_assister_limit" integer DEFAULT 1 NOT NULL,
	"initiator_can_assist" boolean DEFAULT false NOT NULL,
	"expires_in_seconds" integer DEFAULT 86400 NOT NULL,
	"max_instances_per_initiator" integer,
	"rewards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"activity_id" uuid,
	"activity_node_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_pool_contributions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"assister_end_user_id" text NOT NULL,
	"amount" bigint NOT NULL,
	"remaining_after" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_pool_instances" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"config_id" uuid NOT NULL,
	"initiator_end_user_id" text NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"remaining" bigint NOT NULL,
	"target_amount" bigint NOT NULL,
	"contribution_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"reward_granted_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assist_pool_rewards_ledger" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"instance_id" uuid NOT NULL,
	"initiator_end_user_id" text NOT NULL,
	"rewards" jsonb NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assist_pool_configs" ADD CONSTRAINT "assist_pool_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_pool_contributions" ADD CONSTRAINT "assist_pool_contributions_instance_id_assist_pool_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."assist_pool_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_pool_instances" ADD CONSTRAINT "assist_pool_instances_config_id_assist_pool_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."assist_pool_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assist_pool_rewards_ledger" ADD CONSTRAINT "assist_pool_rewards_ledger_instance_id_assist_pool_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."assist_pool_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assist_pool_configs_org_idx" ON "assist_pool_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assist_pool_configs_org_alias_uidx" ON "assist_pool_configs" USING btree ("organization_id","alias") WHERE "assist_pool_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "assist_pool_configs_activity_idx" ON "assist_pool_configs" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "assist_pool_contributions_instance_assister_idx" ON "assist_pool_contributions" USING btree ("instance_id","assister_end_user_id");--> statement-breakpoint
CREATE INDEX "assist_pool_contributions_instance_created_idx" ON "assist_pool_contributions" USING btree ("instance_id","created_at");--> statement-breakpoint
CREATE INDEX "assist_pool_instances_config_idx" ON "assist_pool_instances" USING btree ("config_id");--> statement-breakpoint
CREATE INDEX "assist_pool_instances_initiator_idx" ON "assist_pool_instances" USING btree ("organization_id","initiator_end_user_id");--> statement-breakpoint
CREATE INDEX "assist_pool_instances_due_idx" ON "assist_pool_instances" USING btree ("status","expires_at") WHERE status = 'in_progress';--> statement-breakpoint
CREATE UNIQUE INDEX "assist_pool_rewards_ledger_instance_uidx" ON "assist_pool_rewards_ledger" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "assist_pool_rewards_ledger_org_initiator_idx" ON "assist_pool_rewards_ledger" USING btree ("organization_id","initiator_end_user_id");