CREATE TABLE "activity_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_payload" jsonb NOT NULL,
	"duration_spec" jsonb NOT NULL,
	"recurrence" jsonb NOT NULL,
	"alias_pattern" text NOT NULL,
	"next_instance_at" timestamp,
	"last_instantiated_alias" text,
	"last_instantiated_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_templates" ADD CONSTRAINT "activity_templates_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "activity_templates_org_alias_uidx" ON "activity_templates" USING btree ("organization_id","alias");--> statement-breakpoint
CREATE INDEX "activity_templates_due_idx" ON "activity_templates" USING btree ("enabled","next_instance_at") WHERE enabled = true;