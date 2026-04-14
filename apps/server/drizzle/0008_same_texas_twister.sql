CREATE TABLE "mail_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"rewards" jsonb NOT NULL,
	"target_type" text NOT NULL,
	"target_user_ids" jsonb,
	"require_read" boolean DEFAULT false NOT NULL,
	"sender_admin_id" text,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"origin_source" text,
	"origin_source_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mail_user_states" (
	"message_id" uuid NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"read_at" timestamp,
	"claimed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mail_user_states_pk" PRIMARY KEY("message_id","end_user_id")
);
--> statement-breakpoint
ALTER TABLE "mail_messages" ADD CONSTRAINT "mail_messages_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_user_states" ADD CONSTRAINT "mail_user_states_message_id_mail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."mail_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mail_messages_org_sent_idx" ON "mail_messages" USING btree ("organization_id","sent_at");--> statement-breakpoint
CREATE INDEX "mail_messages_org_expires_idx" ON "mail_messages" USING btree ("organization_id","expires_at");--> statement-breakpoint
CREATE INDEX "mail_messages_multicast_gin_idx" ON "mail_messages" USING gin ("target_user_ids") WHERE "mail_messages"."target_type" = 'multicast';--> statement-breakpoint
CREATE UNIQUE INDEX "mail_messages_origin_uidx" ON "mail_messages" USING btree ("organization_id","origin_source","origin_source_id") WHERE "mail_messages"."origin_source" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "mail_user_states_user_idx" ON "mail_user_states" USING btree ("organization_id","end_user_id");