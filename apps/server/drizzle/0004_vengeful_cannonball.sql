CREATE TABLE "client_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"publishable_key" text NOT NULL,
	"encrypted_secret" text NOT NULL,
	"dev_mode" boolean DEFAULT false NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_credentials" ADD CONSTRAINT "client_credentials_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_credentials_organization_id_idx" ON "client_credentials" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_credentials_publishable_key_uidx" ON "client_credentials" USING btree ("publishable_key");