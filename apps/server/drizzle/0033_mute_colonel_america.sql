CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"cover_image_url" text,
	"cta_url" text,
	"cta_label" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"visible_from" timestamp,
	"visible_until" timestamp,
	"platforms" text[],
	"locales" text[],
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "announcements_org_alias_uidx" ON "announcements" USING btree ("organization_id","alias");--> statement-breakpoint
CREATE INDEX "announcements_org_visible_idx" ON "announcements" USING btree ("organization_id","is_active","visible_from","visible_until");