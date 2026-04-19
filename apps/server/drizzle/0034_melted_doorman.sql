CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"code" text NOT NULL,
	"rotated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_relationships" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"inviter_end_user_id" text NOT NULL,
	"invitee_end_user_id" text NOT NULL,
	"inviter_code_snapshot" text NOT NULL,
	"bound_at" timestamp DEFAULT now() NOT NULL,
	"qualified_at" timestamp,
	"qualified_reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"code_length" integer DEFAULT 8 NOT NULL,
	"allow_self_invite" boolean DEFAULT false NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_settings_code_length_check" CHECK ("invite_settings"."code_length" >= 4 AND "invite_settings"."code_length" <= 24 AND "invite_settings"."code_length" % 4 = 0)
);
--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_relationships" ADD CONSTRAINT "invite_relationships_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_settings" ADD CONSTRAINT "invite_settings_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_codes_org_user_uidx" ON "invite_codes" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_codes_org_code_uidx" ON "invite_codes" USING btree ("organization_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "invite_relationships_org_invitee_uidx" ON "invite_relationships" USING btree ("organization_id","invitee_end_user_id");--> statement-breakpoint
CREATE INDEX "invite_relationships_org_inviter_bound_idx" ON "invite_relationships" USING btree ("organization_id","inviter_end_user_id","bound_at");