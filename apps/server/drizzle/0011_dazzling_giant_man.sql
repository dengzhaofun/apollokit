CREATE TABLE "cdkey_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"code_type" text NOT NULL,
	"reward" jsonb NOT NULL,
	"total_limit" integer,
	"per_user_limit" integer DEFAULT 1 NOT NULL,
	"total_redeemed" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdkey_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"code" text NOT NULL,
	"status" text NOT NULL,
	"redeemed_by" text,
	"redeemed_at" timestamp,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdkey_redemption_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"code_id" uuid,
	"code" text NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text NOT NULL,
	"fail_reason" text,
	"reward" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cdkey_user_states" (
	"batch_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cdkey_user_states_pk" PRIMARY KEY("batch_id","end_user_id")
);
--> statement-breakpoint
ALTER TABLE "cdkey_batches" ADD CONSTRAINT "cdkey_batches_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdkey_codes" ADD CONSTRAINT "cdkey_codes_batch_id_cdkey_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."cdkey_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cdkey_user_states" ADD CONSTRAINT "cdkey_user_states_batch_id_cdkey_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."cdkey_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cdkey_batches_org_idx" ON "cdkey_batches" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cdkey_batches_org_alias_uidx" ON "cdkey_batches" USING btree ("organization_id","alias") WHERE "cdkey_batches"."alias" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cdkey_codes_org_code_uidx" ON "cdkey_codes" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "cdkey_codes_batch_status_idx" ON "cdkey_codes" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "cdkey_codes_redeemed_by_idx" ON "cdkey_codes" USING btree ("redeemed_by") WHERE "cdkey_codes"."redeemed_by" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "cdkey_redemption_logs_source_uidx" ON "cdkey_redemption_logs" USING btree ("organization_id","source","source_id");--> statement-breakpoint
CREATE INDEX "cdkey_redemption_logs_org_user_idx" ON "cdkey_redemption_logs" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "cdkey_redemption_logs_org_batch_idx" ON "cdkey_redemption_logs" USING btree ("organization_id","batch_id");--> statement-breakpoint
CREATE INDEX "cdkey_user_states_org_user_idx" ON "cdkey_user_states" USING btree ("organization_id","end_user_id");