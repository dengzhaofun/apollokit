CREATE TABLE "character_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"avatar_url" text,
	"portrait_url" text,
	"default_side" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_definitions" ADD CONSTRAINT "character_definitions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_definitions_org_idx" ON "character_definitions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "character_definitions_org_alias_uidx" ON "character_definitions" USING btree ("organization_id","alias") WHERE "character_definitions"."alias" IS NOT NULL;