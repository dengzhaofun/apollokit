CREATE TABLE "eu_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eu_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	CONSTRAINT "eu_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "eu_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"organization_id" text NOT NULL,
	"external_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "eu_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "eu_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eu_account" ADD CONSTRAINT "eu_account_user_id_eu_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."eu_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eu_session" ADD CONSTRAINT "eu_session_user_id_eu_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."eu_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eu_session" ADD CONSTRAINT "eu_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eu_user" ADD CONSTRAINT "eu_user_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eu_account_user_id_idx" ON "eu_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "eu_session_user_id_idx" ON "eu_session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "eu_session_organization_id_idx" ON "eu_session" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "eu_user_organization_id_idx" ON "eu_user" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eu_user_org_external_id_uidx" ON "eu_user" USING btree ("organization_id","external_id") WHERE "eu_user"."external_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "eu_verification_identifier_idx" ON "eu_verification" USING btree ("identifier");