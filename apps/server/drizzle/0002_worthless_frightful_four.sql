CREATE TABLE "check_in_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"alias" text,
	"name" text NOT NULL,
	"description" text,
	"reset_mode" text NOT NULL,
	"week_starts_on" smallint DEFAULT 1 NOT NULL,
	"target" integer,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "check_in_user_states" (
	"config_id" text NOT NULL,
	"end_user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"total_days" integer DEFAULT 0 NOT NULL,
	"current_streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"current_cycle_key" text,
	"current_cycle_days" integer DEFAULT 0 NOT NULL,
	"last_check_in_date" date,
	"first_check_in_at" timestamp,
	"last_check_in_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "check_in_user_states_pk" PRIMARY KEY("config_id","end_user_id")
);
--> statement-breakpoint
ALTER TABLE "check_in_configs" ADD CONSTRAINT "check_in_configs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in_user_states" ADD CONSTRAINT "check_in_user_states_config_id_check_in_configs_id_fk" FOREIGN KEY ("config_id") REFERENCES "public"."check_in_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "check_in_configs_organization_id_idx" ON "check_in_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "check_in_configs_org_alias_uidx" ON "check_in_configs" USING btree ("organization_id","alias") WHERE "check_in_configs"."alias" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "check_in_user_states_org_user_idx" ON "check_in_user_states" USING btree ("organization_id","end_user_id");--> statement-breakpoint
CREATE INDEX "check_in_user_states_config_date_idx" ON "check_in_user_states" USING btree ("config_id","last_check_in_date");