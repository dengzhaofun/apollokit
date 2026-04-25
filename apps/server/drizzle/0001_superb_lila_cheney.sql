CREATE TABLE "cms_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"type_id" uuid NOT NULL,
	"type_alias" text NOT NULL,
	"alias" text NOT NULL,
	"group_key" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"schema_version" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cms_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"schema" jsonb NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"group_options" text[],
	"status" text DEFAULT 'active' NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_entries" ADD CONSTRAINT "cms_entries_type_id_cms_types_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."cms_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cms_types" ADD CONSTRAINT "cms_types_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cms_entries_org_type_alias_uidx" ON "cms_entries" USING btree ("organization_id","type_alias","alias");--> statement-breakpoint
CREATE INDEX "cms_entries_org_type_group_status_idx" ON "cms_entries" USING btree ("organization_id","type_alias","group_key","status");--> statement-breakpoint
CREATE INDEX "cms_entries_tags_gin" ON "cms_entries" USING gin ("tags");--> statement-breakpoint
CREATE INDEX "cms_entries_org_type_updated_idx" ON "cms_entries" USING btree ("organization_id","type_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cms_types_org_alias_uidx" ON "cms_types" USING btree ("organization_id","alias");--> statement-breakpoint
CREATE INDEX "cms_types_org_status_idx" ON "cms_types" USING btree ("organization_id","status");