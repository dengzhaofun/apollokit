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
ALTER TABLE "feature_unlocks" ADD CONSTRAINT "feature_unlocks_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feature_unlocks_org_user_key_idx" ON "feature_unlocks" USING btree ("organization_id","end_user_id","feature_key");--> statement-breakpoint
CREATE INDEX "feature_unlocks_org_user_idx" ON "feature_unlocks" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "feature_unlocks_org_key_idx" ON "feature_unlocks" USING btree ("organization_id","feature_key");