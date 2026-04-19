CREATE TABLE "event_catalog_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"event_name" text NOT NULL,
	"status" text DEFAULT 'inferred' NOT NULL,
	"description" text,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sample_event_data" jsonb,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_catalog_entries" ADD CONSTRAINT "event_catalog_entries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_catalog_org_name_uidx" ON "event_catalog_entries" USING btree ("organization_id","event_name");--> statement-breakpoint
CREATE INDEX "event_catalog_org_last_seen_idx" ON "event_catalog_entries" USING btree ("organization_id","last_seen_at");