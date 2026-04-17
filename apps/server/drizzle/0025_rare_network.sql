CREATE TABLE "task_user_milestone_claims" (
	"task_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"period_key" text NOT NULL,
	"tier_alias" text NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_user_milestone_claims_pk" PRIMARY KEY("task_id","end_user_id","period_key","tier_alias")
);
--> statement-breakpoint
ALTER TABLE "task_definitions" ADD COLUMN "reward_tiers" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "task_user_milestone_claims" ADD CONSTRAINT "task_user_milestone_claims_task_id_task_definitions_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_user_milestone_claims_org_user_idx" ON "task_user_milestone_claims" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "task_user_milestone_claims_user_task_period_idx" ON "task_user_milestone_claims" USING btree ("end_user_id","task_id","period_key");